
/**
 * Module to get data out of proto file for an API Adapter
 * @author spethso
 */
// Load proto file and grpc module
var PROTO_PATH = __dirname + '/webshop.proto';
//var PROTO_PATH = __dirname + '/main.proto';
var grpc = require('grpc');
var parent = grpc.load(PROTO_PATH);
// Useful additional modules
var fs = require('fs');
var HashMap = require('hashmap');
var HashSet = require('hashset');
// Array with all services rpc operation and messages data
var serviceAndMessages = [];
// HashMap containing all message types as JSON
var messageTypes = new HashMap();
// HashSet for JSON type Number
var numberTypes = getNumberTypes();
// HashSet for JSON type String
var stringTypes = getStringTypes();
// Array of packages and related services
var servicesAndPackages = [];


/**
 * Export relevant data
 */
exports.getData = function () {
    initServices(parent, '');
    getData();
    return serviceAndMessages;
}

/**
 * Get packages with related services
 */
function initServices(obj, package) {
    for (var key in obj) {
        if (key == 'service') {
            pkg = package.split('.');
            pkg.length -= 2;
            var sp = {
                package: pkg.join('.'),
                service: obj.service
            };
            servicesAndPackages.push(sp);
        } else {
            initServices(obj[key], package + key + '.');
        }
    }
}

/**
 * Initialize numberTypes hashset
 */
function getNumberTypes() {
    var set = new HashSet();
    var types = ['fixed32', 'uint32', 'float', 'double'];
    types.forEach(function (type) {
        set.add(type);
    })
    return set;
}

/**
 * Initialize stringTypes hashset
 */
function getStringTypes() {
    var set = new HashSet();
    var types = ['string', 'bytes', 'fixed64', 'uint64', 'Timestamp', 'Duration', 'FieldMask'];
    types.forEach(function (type) {
        set.add(type);
    })
    return set;
}

/**
 * Method to fill with data
 */
function getData() {
    servicesAndPackages.forEach(function (sp) {
        messageTypes = new HashMap();
        package = sp.package;
        service = sp.service;
        var serviceName = service.name;
        var operations = [];
        // Fill functions with relevant data
        service.children.forEach(function (element) {
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
            operations.push(rpc);
            var request = element.resolvedRequestType;
            getMessages(request, request.name, 1);
            var response = element.resolvedResponseType;
            getMessages(response, response.name, 1);
        });
        var serviceJSON = {
            package: package,
            serviceName: serviceName,
            operations: operations,
            messages: messageTypes
        };
        serviceAndMessages.push(serviceJSON);
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
            // Placeholder for field kind, e.g. object or string
            var fieldKind;
            // Placeholder for fieldtype
            var fieldType;
            // if field is of message type, pay attention
            if (field.type.name == 'message') {
                fieldKind = 'object';
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
                fieldKind = 'enum';
                // Set fieldType to enum name
                fieldType = field.resolvedType.name;
                isEnum = true;
            } else {
                // In this case, the field is of primitive datatype,
                var fType = field.type.name;
                if (numberTypes.contains(fType)) {
                    fieldKind = 'number';
                } else if (stringTypes.contains(fType)) {
                    fieldKind = 'string';
                } else if (fType == 'bool') {
                    fieldKind = 'boolean';
                } else if (fType == 'int32' || fType == 'int64') {
                    fieldKind = 'integer';
                } else if (fType == 'Any' || fType == 'Struct') {
                    fieldKind = 'object' // Maybe additional reference field
                }
                // set fieldType to this datatype
                fieldType = fType; // TODO: Change other types
            }
            // Create field data
            var specificField = {
                name: field.name,
                type: fieldType,
                kind: fieldKind,
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