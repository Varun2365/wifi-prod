const mongoose = require("mongoose");

const Device = mongoose.Schema({
    sno : Number,
    dateTime : Date, 
    weight : String,
})



module.exports = Device