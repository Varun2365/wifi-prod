const express = require("express");
require('dotenv').config();
const mongoose = require("mongoose");
// Assume these schema files exist in the same directory:
// ./device-id-schema.js
// ./users-schema.js
// ./device-info-schema.js
const DeviceSchema = require("./device-id-schema");
const UserSchema = require("./users-schema");
const deviceInfoSchema = require("./device-info-schema");
const os = require("os");
const PORT = 8000;

const app = express();

// Listening the server
app.listen(PORT, () => {
    console.log(`Server Started At Port : ${PORT}`);
});

// Connecting the MongoDB Server
// Make sure your MongoDB connection string is correct and accessible
const db = mongoose.connect('mongodb+srv://Varun:Varun9999@wifi-server.kvwhr.mongodb.net/Wifi-Module', {
    // useNewUrlParser and useUnifiedTopology are deprecated in recent Mongoose versions and can often be omitted
})
.then(() => console.log('Connected to wifi-module database'))
.catch(err => console.error('Connection error:', err));

// Define Mongoose Models
// The third argument is the collection name. Mongoose pluralizes model names by default,
// so explicitly setting the collection name ensures it matches your database.
const Users = mongoose.model("Users", UserSchema, "Users");
const DeviceInfo = mongoose.model("Device-Info", deviceInfoSchema, "Device-Info");


// Middleware to parse incoming request bodies
// For parsing application/json
app.use(express.json());
// For parsing application/x-www-form-urlencoded (common for form data)
app.use(express.urlencoded({ extended: true }));

// --- Helper Functions ---

/**
 * Parses a weight string (e.g., "0003.3Kg", "0028.2K", "10.0Kg", "5Kg")
 * and returns an object containing the numeric value and a formatted string
 * that preserves the original decimal precision (if present) and appends "Kg".
 * @param {string} weightStr - The weight string to parse.
 * @returns {object} An object containing:
 * - {number} value: The parsed weight as a double.
 * - {string} formatted: The formatted weight string with original decimals and "Kg".
 */
function parseAndFormatWeight(weightStr) {
    if (typeof weightStr !== 'string') {
        console.warn("parseAndFormatWeight received non-string input:", weightStr);
        return { value: 0.0, formatted: "0.0Kg" }; // Default to consistent format for invalid input
    }

    // Remove "Kg" or "K" case-insensitively and trim any whitespace
    const cleanedStr = weightStr.replace(/[Kk][gG]?/g, '').trim();

    // Check if the cleaned string explicitly contains a decimal point
    const hasDecimal = cleanedStr.includes('.');

    try {
        const parsedValue = parseFloat(cleanedStr);

        if (isNaN(parsedValue)) {
            return { value: 0.0, formatted: "0.0Kg" };
        }

        let finalFormattedPart;
        if (hasDecimal) {
            // If original string had a decimal, use the cleaned string to preserve its exact form (e.g., "10.0")
            finalFormattedPart = cleanedStr;
        } else {
            // If no decimal in original, but parsedValue is an integer, use it directly (e.g., "5")
            // If parsedValue is not an integer but no decimal was present (unlikely with parseFloat),
            // toString() would add decimals as needed.
            finalFormattedPart = parsedValue.toString();
        }
        
        return { value: parsedValue, formatted: `${finalFormattedPart}Kg` };

    } catch (e) {
        console.error(`Error parsing or formatting weight string '${weightStr}': ${e.message}`);
        return { value: 0.0, formatted: "0.0Kg" }; // Default to consistent format on error
    }
}

/**
 * Saves incoming device data to the corresponding MongoDB collection.
 * @param {object} data - The data object containing deviceid, date, time, and weight.
 */
function saveInfo(data) {
    console.log(`Incoming Data for saveInfo: Date: ${data.date}, Time: ${data.time}, Weight: ${data.weight}, DeviceID: ${data.deviceid}`);

    // Dynamically get the Mongoose model for the specific device ID
    // This assumes `data.deviceid` corresponds directly to a collection name.
    const currentDevice = mongoose.model(data.deviceid, DeviceSchema, data.deviceid);

    const rDate = data.date; // e.g., "11/7/2025" (DD/MM/YYYY or D/M/YYYY)
    const rTime = data.time; // e.g., "14:12:13" (HH:MM:SS)

    // Parse the weight and get the formatted string for storage
    const weightResult = parseAndFormatWeight(data.weight);
    const formattedWeightForDB = weightResult.formatted;

    // Parse date components (assuming DD/MM/YYYY or D/M/YYYY from device)
    const [day, month, year] = rDate.split("/").map(Number);
    // Parse time components
    const [hours, minutes, seconds] = rTime.split(":").map(Number);

    // Create a Date object. Month is 0-indexed in JavaScript Date constructor (January is 0, July is 6).
    // So, subtract 1 from the month received.
    let localDateTimeObject = new Date(year, month - 1, day, hours, minutes, seconds);

    // Define IST offset (UTC+5:30). Convert local device time (IST) to UTC for consistent storage.
    // We subtract the offset from the local time to get the UTC equivalent.
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const utcDateTimeObject = new Date(localDateTimeObject.getTime() - IST_OFFSET_MS);

    currentDevice.create({
        weight: formattedWeightForDB, // Save the strictly formatted weight string
        sno: parseInt(data['s.no.']), // Ensure 's.no.' is parsed as an integer
        dateTime: utcDateTimeObject // Save the converted UTC datetime
    })
    .then(() => console.log(`Data saved successfully for device: ${data.deviceid}`))
    .catch(err => console.error(`Error saving data for device ${data.deviceid}: ${err.message}`));
}

/**
 * Calculates the date of the next day.
 * @param {Date} date - The input Date object.
 * @returns {Date} A new Date object representing the next day.
 */
function getNextDay(date) {
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);
    return nextDate;
}

// --- API Routes ---

app.get("/", (req, res) => {
    res.send("Home Page End Point");
});

app.get("/cpu", (req, res) => {
    res.send(`The Number of CPUs is : ${os.cpus()[0].model} ::::: ${os.cpus().length}`);
});

app.get("/data", async (req, res) => {
    const deviceName = req.query.device?.toString();
    const dateQuery = req.query.date?.toString(); // Expected format: DD-MM-YYYY

    if (!deviceName || !dateQuery) {
        return res.status(400).send({
            status: 400,
            dataAvailable: false,
            message: "Missing device or date parameter."
        });
    }

    try {
        // Parse date from DD-MM-YYYY string to a Date object
        const [day, month, year] = dateQuery.split("-").map(Number);
        const queryDate = new Date(year, month - 1, day); // Month is 0-indexed

        const nextDate = getNextDay(queryDate);
        var responseJSON = {};

        // Check if the collection for the device exists
        const collectionExists = await mongoose.connection.db.listCollections({ name: deviceName }).toArray();
        if (collectionExists.length === 0) {
            responseJSON.status = 400;
            responseJSON.dataAvailable = false;
            responseJSON.message = "Cannot Find Device Collection. It might not exist or no data has been sent for it yet.";
            return res.status(400).send(responseJSON);
        }

        // Dynamically get the Mongoose model for the device's collection
        const currentDevice = mongoose.model(deviceName, DeviceSchema, deviceName);
        var data = await currentDevice.find(
            { dateTime: { $gte: queryDate, $lt: nextDate } },
            { _id: 0, __v: 0 } // Exclude _id and __v fields
        ).lean(); // Use .lean() for faster query results if you don't need Mongoose document methods

        responseJSON.data = data;
        responseJSON.dataAvailable = data.length > 0;
        responseJSON.message = data.length === 0 ? "No data found for the selected date." : "Data Found";
        console.log("Data fetched:", responseJSON);
        res.status(200).send(responseJSON);

    } catch (e) {
        console.error("Error fetching data:", e.message);
        res.status(500).send("Error fetching data: " + e.message);
    }
});

app.post("/upload", (req, res) => {
    console.log("POST /upload headers:", req.headers);
    // Ensure essential headers exist and are valid for processing
    // Assuming 'date', 'time', 'weight', 's.no.', and 'deviceid' are sent in headers
    if (req.headers.time && req.headers.time !== "." && !req.headers.date?.startsWith("??") && req.headers.deviceid && req.headers.weight && req.headers['s.no.']) {
        try {
            saveInfo(req.headers);
            res.status(200).send("Data received and processed (POST)");
        } catch (e) {
            console.error("Unable To Save Info (POST):", e.message);
            res.status(500).send("Error processing data (POST).");
        }
    } else {
        console.log("Entry Wasn't Saved (POST): Invalid or missing data in headers!");
        res.status(400).send("Invalid or incomplete data provided (POST).");
    }
});

app.get("/upload", (req, res) => {
    console.log("GET /upload query:", req.query);
    // Ensure essential query parameters exist and are valid for processing
    // Assuming 'date', 'time', 'weight', 's.no.', and 'deviceid' are sent in query
    if (req.query.time && req.query.time !== "." && !req.query.date?.startsWith("??") && req.query.deviceid && req.query.weight && req.query['s.no.']) {
        try {
            saveInfo(req.query);
            res.status(200).send("Data received and processed (GET)");
        } catch (e) {
            console.error("Unable To Save Info (GET): " + e.message);
            res.status(500).send("Error processing data (GET).");
        }
    } else {
        console.log("Entry Wasn't Saved (GET): Invalid or missing data in query!");
        res.status(400).send("Invalid or incomplete data provided (GET).");
    }
});

app.get('/users/signup', async (req, res) => {
    const params = req.query;
    if (!params.email || !params.name || !params.phone || !params.cName || !params.password) {
        return res.status(400).send({
            message: "Missing required signup fields.",
            validResponse: false
        });
    }
    try {
        const user = await Users.findOne({ email: params.email });

        if (user === null) {
            await Users.create({
                email: params.email,
                name: params.name,
                phone: params.phone,
                companyName: params.cName,
                password: params.password, // **WARNING: Store hashed passwords in production!**
            });
            res.status(201).send({ // 201 Created for successful creation
                message: "Account Created Successfully",
                validResponse: true,
            });
        } else {
            res.status(409).send({ // 409 Conflict if resource already exists
                message: "Account Already Exists",
                validResponse: false
            });
        }
    } catch (error) {
        console.error("Error creating user account:", error);
        res.status(500).send({
            message: "Error creating account",
            validResponse: false
        });
    }
});

app.get('/users/login', async (req, res) => {
    const params = req.query;
    if (!params.email || !params.password) {
        return res.status(400).send({
            validResponse: false,
            message: "Missing email or password."
        });
    }
    try {
        const user = await Users.findOne({ email: params.email });

        if (user == null) {
            res.status(404).send({ // 404 Not Found if user doesn't exist
                validResponse: false,
                message: "User Doesn't Exist",
            });
        } else {
            if (params.password === user.password) { // **WARNING: Compare hashed passwords!**
                res.status(200).send({
                    validResponse: true,
                    message: "Logged In Successfully",
                    data: user.devices // Send associated devices
                });
            } else {
                res.status(401).send({ // 401 Unauthorized for incorrect password
                    validResponse: false,
                    message: "Incorrect password"
                });
            }
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).send({
            validResponse: false,
            message: "An error occurred during login."
        });
    }
});

app.get('/users/data', async (req, res) => {
    const params = req.query;

    if (params.action === "emailExist") {
        if (!params.email) {
            return res.status(400).send({ message: "Email parameter is required.", validResponse: false });
        }
        console.log("Email Exists Check Query for:", params.email);
        try {
            const user = await Users.findOne({ email: params.email });
            if (user === null) {
                res.status(200).send({
                    message: "Account Can Be Created",
                    validResponse: true
                });
            } else {
                res.status(200).send({ // User exists, so validResponse is false for 'can be created'
                    message: "Account Already Exists",
                    validResponse: false
                });
            }
        } catch (error) {
            console.error("Error checking email existence:", error);
            res.status(500).send({
                message: "Error checking email existence",
                validResponse: false
            });
        }
    }

    else if (params.action === "addDevice") {
        const { di, dp, ui, cn, al, lc } = params; // Destructure parameters for clarity
        if (!di || !dp || !ui || !cn || !al || !lc) {
            return res.status(400).send({ message: "Missing required fields for adding device.", validResponse: false });
        }
        console.log(`Add Device Request: DeviceID: ${di}, UserID: ${ui}`);
        try {
            const user = await Users.findOne({ email: ui });
            const cDevice = await DeviceInfo.findOne({ deviceId: di });

            if (user == null) {
                return res.status(404).send({ validResponse: false, message: "User Not Found." });
            }
            if (cDevice == null) {
                return res.status(404).send({ validResponse: false, message: "Device Info Not Found in system. Please register the device first." });
            }

            console.log(`Device password from DB: ${cDevice.pass}, Provided password: ${dp}`);
            if (cDevice.pass === dp) { // **WARNING: Compare hashed passwords!**
                const deviceExistsInUser = user.devices.some(device => device.name === di);

                if (!deviceExistsInUser) {
                    user.devices.push({
                        name: di,
                        companyName: cn,
                        alias: al,
                        location: lc,
                    });
                    await user.save(); // Save the updated user!

                    // Also add user to device's owners list if not already there
                    if (!cDevice.owners.includes(ui)) {
                        cDevice.owners.push(ui);
                        await cDevice.save(); // Save the device info as well.
                    }
                    return res.status(200).send({ validResponse: true, message: "Device Added Successfully." });
                } else {
                    return res.status(409).send({ validResponse: false, message: "Device already added to your account." });
                }
            } else {
                return res.status(401).send({ validResponse: false, message: "Incorrect Device Password." });
            }
        } catch (e) {
            console.error("Error in addDevice:", e.message);
            res.status(500).send({ validResponse: false, message: "Error adding device." });
        }
    }

    else if (params.action === "getInfo") {
        const emailId = params.ui;
        if (!emailId) {
            return res.status(400).send({ validResponse: false, message: "User email (ui) is required." });
        }
        try {
            const user = await Users.findOne({ email: emailId });

            if (user == null) {
                res.status(404).send({ validResponse: false, message: 'No User Found', data: [] });
            } else {
                res.status(200).send({
                    validResponse: true,
                    message: "Data Retrieved",
                    name: user.name,
                    data: user.devices // Send the array of devices
                });
            }
        } catch (e) {
            console.error("Error in getInfo:", e.message);
            res.status(500).send({ validResponse: false, message: "Error retrieving user info.", data: [] });
        }
    }

    else if (params.action === "removeDevice") {
        console.log("Remove Device request");
        const emailId = params.ui;
        const targetDevice = params.deviceId;
        if (!emailId || !targetDevice) {
            return res.status(400).send({ validResponse: false, message: "User email (ui) and deviceId are required." });
        }

        try {
            const user = await Users.findOne({ email: emailId });
            if (user != null) {
                const initialLength = user.devices.length;
                // Filter out the device to be removed
                user.devices = user.devices.filter(device => device.name !== targetDevice);

                if (user.devices.length < initialLength) {
                    await user.save(); // Save the updated user document
                    console.log(`Device '${targetDevice}' removed from user '${emailId}'.`);

                    // Also remove user from device's owners list if present
                    const cDevice = await DeviceInfo.findOne({ deviceId: targetDevice });
                    if(cDevice && cDevice.owners.includes(emailId)) {
                        cDevice.owners = cDevice.owners.filter(owner => owner !== emailId);
                        await cDevice.save();
                        console.log(`User '${emailId}' removed from '${targetDevice}' owners list.`);
                    }
                    
                    res.status(200).send({ validResponse: true, message: "Device Removed Successfully." });
                } else {
                    res.status(404).send({ validResponse: false, message: "Device Not Found in your list." });
                }
            } else {
                res.status(404).send({ validResponse: false, message: "User Not Found." });
            }
        } catch (e) {
            console.error("Error removing device:", e.message);
            res.status(500).send({ validResponse: false, message: "Error removing device." });
        }
    } else {
        // If 'action' parameter is not recognized
        res.status(400).send({ validResponse: false, message: "Invalid action parameter." });
    }
});

// Route to create a new device entry in the 'Device-Info' collection
app.get('/createDevice', async (req, res) => {
    const params = req.query;
    if (!params.di || !params.pass) {
        return res.status(400).send("Missing deviceId (di) or password (pass) parameters.");
    }
    try {
        const existingDevice = await DeviceInfo.findOne({ deviceId: params.di });
        if (existingDevice) {
            return res.status(409).send("Device with this ID already exists.");
        }
        await DeviceInfo.create({
            deviceId: params.di,
            pass: params.pass, // **WARNING: Store hashed passwords for devices too!**
            owners: [] // Initialize with an empty array of owners
        });
        res.status(201).send("Device Created Successfully.");
    } catch (e) {
        console.error("Error creating device:", e.message);
        res.status(500).send("Error creating device: " + e.message);
    }
});