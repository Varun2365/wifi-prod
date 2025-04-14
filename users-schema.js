const mongoose = require("mongoose")
const devicesSchema = mongoose.Schema({
    name : {
        type : String,
    },
    companyName : {
        type : String, 
    },
    alias : {
        type : String , 
    },
    location : {
        type : String, 
    }
});
const userSchema = mongoose.Schema({
    email : {
        type : String, 
        unique : true, 
        required : true,
    },
    name : {
        type : String , 
        required : true,
    },
    phone : {
        type : String ,
        required : true,
    },
    companyName : {
        type : String
    },
    password : {
        type : String
    },
    devices : {
        type : [Object]
    }
})

module.exports = userSchema