
/**
 * Module to map proto to swagger
 * @author spethso
 */
var fs = require('fs');
var proto = require('./protoData.js');
var HashSet = require('hashset');
var protoData = proto.getData();
// Proto package
var package = protoData.package;
// Array with service and operations
var serviceAndOperations = protoData.services;
// Service operations
var operations = protoData.operations;
// Proto messages
var messages = protoData.messages;
// Utility package to inspect json objects
const util = require('util');
// Allowed primitive swagger types
var primitiveTypes = setPrimitiveTypes();

function setPrimitiveTypes() {
    var pt = new HashSet();
    var ptArray = ['integer', 'number', 'string', 'boolean', 'enum'];
    ptArray.forEach(function (t) {
        pt.add(t);
    })
    return pt;
}

// Standard param
var stdParam = {
    name: 'start',
    in: 'query',
    type: 'boolean',
    default: true
};

// Instance unique identifier param
var instanceIDParam = {
    name: 'id',
    in: 'path',
    description: 'Unique identifier of instance',
    required: true,
    type: 'string'
}

// Standard 202 response with instance path
var response_202 = {
    '202': {
        description: 'Instance resource',
        headers: {
            'Content-Location': {
                description: 'Path to created instance resource',
                type: 'string'
            }
        },
        schema: {
            $ref: '#/definitions/Instance'
        }
    }
};

// Empty body response with 200 code
var response_200_empty = {
    '200': { description: 'Empty body' }
};

// swagger object
var swagger = {
    swagger: '2.0',
    info: {
        title: 'REST API',
        description: 'Generated from gRPC API',
        version: '1.0.0'
    },
    basePath: '/',
    paths: {},
    definitions: {}
};

function getPaths() {
    var globalPathName = '';
    if (true) { // TODO: package exists?
        globalPathName += '/' + package;
    }
    serviceAndOperations.forEach(function (service) {
        // Path URL different for each service
        var servicePathName = globalPathName + '/' + service.serviceName;
        // Go through all operations of a specific service and set swagger parts
        service.operations.forEach(function (operation) {
            var pathName = servicePathName + '/' + operation.name;
            var pathObject = {
                post: {
                    summary: operation.name,
                    consumes: ['application/json'],
                    tags: [service.serviceName],
                    parameters: [
                        stdParam,
                        {
                            name: 'input',
                            in: 'body',
                            schema: { $ref: '#/definitions/' + operation.request.name }
                        }
                    ],
                    responses: response_202
                }
            };
            // Add path to paths with specific name and path object
            swagger.paths[pathName] = pathObject;

            // Operation on instances
            pathName += '/instances/{id}';
            var paramArray = [instanceIDParam];
            var res = {
                '200': {
                    description: 'Instance resource',
                    schema: { $ref: '#/definitions/Instance' }
                }
            };
            if (operation.response.isStream == false) {
                // Add second param if operation does NOT have out stream
                paramArray.push({
                    name: 'excludeOutput',
                    in: 'query',
                    description: 'Omit instance output in response',
                    type: 'boolean',
                    default: false
                });
                // Set response to normal instance resource without stream
                res = {
                    '200': {
                        description: 'Instance resource',
                        schema: {
                            type: 'object',
                            allOf: [
                                { $ref: '#/definitions/Instance' },
                                {
                                    type: 'object',
                                    properties: {
                                        out: { $ref: '#/definitions/' + operation.response.name }
                                    }
                                }
                            ]
                        }
                    }
                };
            }
            pathObject = {
                patch: {
                    summary: 'Update instance resource',
                    consumes: ['application/json'],
                    parameters: [
                        instanceIDParam,
                        {
                            name: 'instance',
                            in: 'body',
                            description: 'Updated parts of instance resource',
                            required: true,
                            schema: { $ref: '#/definitions/InstanceWritable' }
                        }
                    ],
                    tags: ['Instances', service.serviceName],
                    responses: response_200_empty
                },
                get: {
                    summary: 'Get instance resource',
                    produces: ['application/json'],
                    parameters: paramArray,
                    tags: ['Instances', service.serviceName],
                    responses: res
                }
            };
            // Add path to paths with specific name and path object
            swagger.paths[pathName] = pathObject;

            if (operation.request.isStream == false) {
                noRequestStreamSwaggerPart(operation, pathName, service.serviceName);
            }
            if (operation.response.isStream == false) {
                noResponseStreamSwaggerPart(operation, pathName, service.serviceName);
            }
            if (operation.request.isStream == true) {
                requestStreamSwaggerPart(operation, pathName, service.serviceName);
            }
            if (operation.response.isStream == true) {
                responseStreamSwaggerPart(operation, pathName, service.serviceName);
            }
            if (operation.request.isStream == true && operation.response.isStream == true) {
                bidirectionalStreamSwaggerPart(operation, pathName, service.serviceName);
            }
        });
    });
}

/**
 * Function to fill swagger definitions part
 */
function getDefinitions() {
    var definitions = {
        Instance: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'Unique identifier of instance'
                },
                started: { type: 'boolean' },
                done: { type: 'boolean' },
                createdAt: { type: 'string' },
                startedAt: { type: 'string' },
                doneAt: { type: 'string' },
                error: {
                    type: 'string',
                    description: 'Error message if instance failed'
                },
                links: {
                    type: 'object',
                    description: 'Links to relevant resources such as output'
                }
            }
        },
        InstanceWritable: {
            type: 'object',
            properties: { started: { type: 'boolean' } }
        }
    };

    // Add message objects to definitions part
    messages.forEach(function (message) {
        var m = {
            type: 'object',
            properties: {}
        };
        // Add properties to message
        message.fields.forEach(function (field) {
            var fieldKind = field.kind;
            // If field is repeated, set type to Array with items
            if (field.isRepeated == true) {
                if (!primitiveTypes.contains(fieldKind)) {
                    var f = {
                        type: 'array',
                        items: { $ref: '#/definitions/' + field.type }
                    };
                    m.properties[field.name] = f;
                } else if (fieldKind == 'enum') {
                    var enumValues = [];
                    for (var enumValue in field.enum) {
                        enumValues.push(enumValue);
                    }
                    var f = {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: enumValues
                        }
                    };
                    m.properties[field.name] = f;
                } else {
                    var f = {
                        type: 'array',
                        items: { type: fieldKind }
                    };
                    m.properties[field.name] = f;
                }
            }
            // Otherwise set field to normal type
            else if (!primitiveTypes.contains(fieldKind)) {
                var f = {
                    $ref: '#/definitions/' + field.type
                };
                m.properties[field.name] = f;
            } else if (fieldKind == 'enum') {
                var enumValues = [];
                for (var enumValue in field.enum) {
                    enumValues.push(enumValue);
                }
                var f = {
                    type: 'string',
                    enum: enumValues
                };
                m.properties[field.name] = f;
            } else {
                var f = { type: fieldKind };
                m.properties[field.name] = f;
            }

        });
        // Add message to definitions part
        definitions[message.name] = m;
    });

    // Set swagger definitions part
    swagger.definitions = definitions;
}

/**
 * Function for a path that is only generated for gRPC operations
 * that have a bidirectional stream of request and response messages 
 */
function bidirectionalStreamSwaggerPart(operation, pathName, serviceName) {
    var localPathName = pathName + '/bi/stream';
    var pathObject = {
        get: {
            summary: 'Stream of output messages as newline-delimited JSON, see http://jsonlines.org',
            parameters: [
                instanceIDParam,
                {
                    name: 'stream',
                    description: 'Input stream',
                    in: 'body',
                    required: true,
                    schema: { $ref: '#definitions/' + operation.request.name }
                }
            ],
            tags: ['Instances', 'Streams', serviceName],
            responses: {
                '200': {
                    description: 'Output stream',
                    schema: { $ref: '#/definitions/' + operation.response.name }
                }
            }
        }
    };
    // Add path to paths with specific name and path object
    swagger.paths[localPathName] = pathObject;
}

/**
 * Function for a path that is only generated for gRPC operations
 * that have a stream of response messages 
 */
function responseStreamSwaggerPart(operation, pathName, serviceName) {
    var localPathName = pathName + '/out/stream';
    var pathObject = {
        get: {
            summary: 'Stream of output messages as newline-delimited JSON, see http://jsonlines.org',
            parameters: [instanceIDParam],
            tags: ['Instances', 'Streams', serviceName],
            responses: {
                '200': {
                    description: 'Output stream',
                    schema: { $ref: '#/definitions/' + operation.response.name }
                }
            }
        }
    };
    // Add path to paths with specific name and path object
    swagger.paths[localPathName] = pathObject;
}

/**
 * Function for a path that is only generated for gRPC operations
 * that have a stream of request messages 
 */
function requestStreamSwaggerPart(operation, pathName, serviceName) {
    var localPathName = pathName + '/in/stream';
    var pathObject = {
        post: {
            summary: 'Stream of input messages as newline-delimited JSON, see http://jsonlines.org',
            parameters: [
                instanceIDParam,
                {
                    name: 'stream',
                    description: 'Input stream',
                    in: 'body',
                    required: true,
                    schema: { $ref: '#/definitions/' + operation.request.name }
                }
            ],
            tags: ['Instances', 'Streams', serviceName],
            responses: response_200_empty
        }
    };
    // Add path to paths with specific name and path object
    swagger.paths[localPathName] = pathObject;
}

/**
 * Function for a path that is only generated for gRPC operations
 * that NO NOT have a stream of response messages 
 */
function noResponseStreamSwaggerPart(operation, pathName, serviceName) {
    var responseObjectFields = messages.get(operation.response.name).fields;
    responseObjectFields.forEach(function (field) {
        var localPathName = pathName + '/out/fields/' + field.name;
        // Kind of field, e.g. object or number
        var fieldKind = field.kind;
        // Specific type of field, e.g. Example, float or int32
        var fieldType = field.type;
        // Schema part of path object
        var schema = {};
        // Fill in schema part as Array if field is repeated
        if (field.isRepeated == true) {
            schema = getArraySchema(field, fieldKind, fieldType);
        }
        // Otherwise fill in schema part
        else if (fieldKind == 'object') {
            // Reference on definitions object
            schema = { $ref: '#/definitions/' + fieldType };
        } else if (fieldKind == 'enum') {
            // Get field enum values
            var enumValues = [];
            for (var enumValue in field.enum) {
                enumValues.push(enumValue);
            }
            // Set enum values
            schema = {
                type: 'string',
                enum: enumValues,
                //required: true
            };
        } else {
            // Set to primitive type
            schema = { type: fieldKind }; // TODO: add format
        }
        var pathObject = {
            get: {
                summary: 'Get output field',
                parameters: [instanceIDParam],
                tags: ['Instances', 'Fields', serviceName],
                responses: {
                    '200': {
                        description: 'Field value',
                        schema: schema
                    }
                }
            }
        };
        // Add path to paths with specific name and path object
        swagger.paths[localPathName] = pathObject;
    });

    // New local path name
    localPathName = pathName + '/out';
    pathObject = {
        get: {
            summary: 'Get output message',
            parameters: [instanceIDParam],
            tags: ['Instances', 'Fields', serviceName],
            responses: {
                '200': {
                    description: 'Output message',
                    schema: { $ref: '#/definitions/' + operation.response.name }
                }
            }
        }
    };
    // Add path to paths with specific name and path object
    swagger.paths[localPathName] = pathObject;
}

/**
 * Function for a path that is only generated for gRPC operations
 * that NO NOT have a stream of request messages 
 */
function noRequestStreamSwaggerPart(operation, pathName, serviceName) {
    var requestObjectFields = messages.get(operation.request.name).fields;
    requestObjectFields.forEach(function (field) {
        var localPathName = pathName + '/in/fields/' + field.name;
        // Kind of field, e.g. object or number
        var fieldKind = field.kind;
        // Specific type of field, e.g. Example, float or int32
        var fieldType = field.type;
        // Schema part of path object
        var schema = {};
        // Fill in schema part as Array if field is repeated
        if (field.isRepeated == true) {
            schema = getArraySchema(field, fieldKind, fieldType);
        }
        // Otherwise fill in schema part
        else if (fieldKind == 'object') {
            // Reference on definitions object
            schema = { $ref: '#/definitions/' + fieldType };
        } else if (fieldKind == 'enum') {
            // Get field enum values
            var enumValues = [];
            for (var enumValue in field.enum) {
                enumValues.push(enumValue);
            }
            // Set enum values
            schema = {
                type: 'string',
                enum: enumValues,
                //required: true
            };
        } else {
            // Set to primitive type
            schema = { type: fieldKind }; // TODO: add format
        }
        var pathObject = {
            put: {
                summary: 'Set input field',
                parameters: [
                    instanceIDParam,
                    {
                        name: 'value',
                        in: 'body',
                        description: 'Field value',
                        required: true,
                        schema: schema
                    }
                ],
                tags: ['Instances', 'Fields', serviceName],
                responses: response_200_empty
            }
        };
        // Add path to paths with specific name and path object
        swagger.paths[localPathName] = pathObject;
    });
}

/**
 * Function to fill in request or response filed schema part with array
 */
function getArraySchema(field, fieldKind, fieldType) {
    var schema = {};
    if (fieldKind == 'object') {
        schema = {
            type: 'array',
            items: { $ref: '#/definitions/' + fieldType }
        }
    } else if (fieldKind == 'enum') {
        // Get field enum values
        var enumValues = [];
        for (var enumValue in field.enum) {
            enumValues.push(enumValue);
        }
        // Set enum values
        schema = {
            type: 'array',
            items: {
                type: 'string',
                enum: enumValues,
                //required: true
            }
        };
    } else {
        schema = {
            type: 'array',
            items: { type: fieldKind }
        };
    }
    return schema;
}

function main() {
    // console.log(operations[0].request.name)
    getPaths();
    getDefinitions();
    //console.log(util.inspect(swagger, { depth: 10, colors: true }));
    fs.writeFile(__dirname + '/swagger.json', JSON.stringify(swagger, null, 2));
}

main();

function formPath(operation, pathName) {
    // Operation path with form
    localPathName = pathName + '/form';
    var pathObject = {
        post: {
            summary: operation.name,
            consumes: ['multipart/form-data'],
            parameters: [
                stdParam,
                {
                    name: 'TODO', // TODO: PLACEHOLDER_FIELD_NAME
                    in: 'formData',
                    type: 'TODO' // TODO derive from proto
                }
            ],
            responses: response_202
        }
    };
    // Add path to paths with specific name and path object
    swagger.paths[localPathName] = pathObject;
}
