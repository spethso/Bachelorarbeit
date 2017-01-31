
/**
 * Module to get data out of proto file for an API Adapter
 * @author spethso
 */
// Load proto file and grpc module
var PROTO_PATH = __dirname + '/webshop.proto';
var grpc = require('grpc');
var parent = grpc.load(PROTO_PATH);
// Name of proto package
var package = initPackage(parent);
package = package.slice(0, package.length - 1); // Delete last '.'
// Object of proto messages and services
var proto = initProto(parent)
// Useful additional modules
var fs = require('fs');
var HashMap = require('hashmap');
var HashSet = require('hashset');

// Proto data
var protoElements = Object.keys(proto);
var serviceName = protoElements[protoElements.length - 1];
// Array of methods
var methods = proto[serviceName].service.children;
// Array with all rpc function data
var functions = [];
// HashMap containing all message types as JSON
var messageTypes = new HashMap();

/**
 * Export relevant data
 */
exports.getData = function () {
    getMessagesData();
    getMethodData();
    var data = {
        package: package,
        operations: functions,
        messages: messageTypes
    };
    return data;
}

/**
 * Initialize package variable
 */
function initPackage(obj) {
    var keys = Object.keys(obj);
    var localPackage = keys[0];
    if (keys.length == 1) {
        return localPackage + '.' + initPackage(obj[keys[0]]);
    } else {
        return '';
    }
}

/**
 * Initialize proto variable
 */
function initProto(obj) {
    var keys = Object.keys(obj)
    if (keys.length == 1) {
        proto = obj[keys[0]];
        return initProto(proto);
    } else {
        return obj;
    }
}

/**
 * Method to fill functions with data
 */
function getMethodData() {
    // Fill funcs with relevant data
    methods.forEach(function (element) {
        var rpc = {
            name: element.name,
            request: {
                name: element.resolvedRequestType.name,
                isStream: element.requestStream
            },
            response: {
                name: element.resolvedResponseType.name,
                isStream: element.responseStream
            }
        };
        functions.push(rpc);
    });
}

/**
 * Method to fill messageTypes with data
 */
function getMessagesData() {
    // Fill messageTypes with relevant data of requests
    methods.forEach(function (element) {
        var request = element.resolvedRequestType;
        getMessages(request, request.name, 1);
        var response = element.resolvedResponseType;
        getMessages(response, response.name, 1);
    });
}

/**
 * Recursiv function for nested messages
 */
function getMessages(message, messageName, limit) {
    // Depth limit to 10. If it is reached, stop!
    if (limit == 10) {
        return;
    }
    // Also stop iff message is already known
    if (messageTypes.has(messageName)) {
        return;
    }
    // Array for message fields
    var fields = [];
    var isEnum = false;
    // Set for local messages (only name)
    var nestedMessages = new HashSet();
    message.children.forEach(function (field) {
        if (field.className == 'Message') {
            nestedMessages.add(field.name);
            var nestedName = messageName + '.' + field.name;
            getMessages(field, nestedName, ++limit);
        }
    });
    // Iterate through all fields of message
    message.children.forEach(function (field) {
        if (field.className == 'Message.Field') {
            // Placeholder for fieldtype
            var fieldType;
            // if field is of message type, pay attention
            if (field.type.name == 'message') {
                // Set fieldType to field message data type
                fieldType = field.resolvedType.name;
                if (nestedMessages.contains(fieldType)) {
                    // Set fieldType to local message type
                    fieldType = messageName + '.' + fieldType;
                } else {
                    // Call method recursively with field message datatype and limit + 1
                    getMessages(field.resolvedType, fieldType, ++limit);
                }
            } else if (field.type.name == 'enum') {
                // Set fieldType to enum name
                fieldType = field.resolvedType.name;
                isEnum = true;
            } else {
                // In this case, the field is of primitive datatype,
                // set fieldType to this datatype
                fieldType = field.type.name; // ToDo: Change to JSON Mapping!!!
            }
            // Create field data
            var specificField = {
                name: field.name,
                type: fieldType,
                isRepeated: field.repeated,
                id: field.id
            };
            if (isEnum) {
                specificField['enum'] = field.resolvedType.object;
            }
            // Push field data to fields Array
            fields.push(specificField);
        }
    });
    // Create message data an add to HashMap
    var specificMessage = {
        name: messageName,
        fields: fields
    };
    messageTypes.set(messageName, specificMessage);
}