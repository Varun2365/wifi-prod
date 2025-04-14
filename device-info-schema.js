const mongoose = require('mongoose')

const deviceInfoSchema = mongoose.Schema({
    deviceId : {
        type : String,
        unique : true,
        required : true,
    },
    pass : {
        type : String, 
        required : true,
    },
    owners : {
        type : [String]
    }
})

module.exports = deviceInfoSchema