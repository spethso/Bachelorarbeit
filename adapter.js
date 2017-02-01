
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
    operations.forEach(function (operation) {
        var pathName = '/' + package + '/' + operation.name;
        var pathObject = {
            post: {
                summary: operation.name,
                consumes: ['application/json'],
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
                tags: ['Instances'],
                responses: response_200_empty
            },
            get: {
                summary: 'Get instance resource',
                produces: ['application/json'],
                parameters: paramArray,
                tags: ['Instances'],
                responses: res
            }
        };
        // Add path to paths with specific name and path object
        swagger.paths[pathName] = pathObject;

        if (operation.request.isStream == false) {
            noRequestStreamSwaggerPart(operation, pathName);
        }
        if (operation.response.isStream == false) {
            noResponseStreamSwaggerPart(operation, pathName);
        }
        if (operation.request.isStream == true) {
            requestStreamSwaggerPart(operation, pathName);
        }
        if (operation.response.isStream == true) {
            responseStreamSwaggerPart(operation, pathName);
        }
        if (operation.request.isStream == true && operation.response.isStream == true) {
            bidirectionalStreamSwaggerPart(operation, pathName);
        }
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
            if (!primitiveTypes.contains(fieldKind)) {
                var f = {
                    $ref: '#/definitions/' + field.type
                };
                m.properties[field.name] = f;
            } else if (fieldKind == 'enum') {
                var enumValues = [];
                for (var enumValue in field.enum) {
                    enumValues.push(enumValue);
                }
                // TODO: correct enum definitions
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
function bidirectionalStreamSwaggerPart(operation, pathName) {
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
            tags: ['Instances', 'Streams'],
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
function responseStreamSwaggerPart(operation, pathName) {
    var localPathName = pathName + '/out/stream';
    var pathObject = {
        get: {
            summary: 'Stream of output messages as newline-delimited JSON, see http://jsonlines.org',
            parameters: [instanceIDParam],
            tags: ['Instances', 'Streams'],
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
function requestStreamSwaggerPart(operation, pathName) {
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
            tags: ['Instances', 'Streams'],
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
function noResponseStreamSwaggerPart(operation, pathName) {
    var responseObjectFields = messages.get(operation.response.name).fields;
    responseObjectFields.forEach(function (field) {
        var localPathName = pathName + '/out/fields/' + field.name;
        // Kind of field, e.g. object or number
        var fieldKind = field.kind;
        // Specific type of field, e.g. Example, float or int32
        var fieldType = field.type;
        // Schema part of path object
        var schema = {};
        // Fill in schema part
        if (fieldKind == 'object') {
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
                tags: ['Instances', 'Fields'],
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
            tags: ['Instances', 'Fields'],
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
function noRequestStreamSwaggerPart(operation, pathName) {
    var requestObjectFields = messages.get(operation.request.name).fields;
    requestObjectFields.forEach(function (field) {
        var localPathName = pathName + '/in/fields/' + field.name;
        // Kind of field, e.g. object or number
        var fieldKind = field.kind;
        // Specific type of field, e.g. Example, float or int32
        var fieldType = field.type;
        // Schema part of path object
        var schema = {};
        // Fill in schema part
        if (fieldKind == 'object') {
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
                tags: ['Instances', 'Fields'],
                responses: response_200_empty
            }
        };
        // Add path to paths with specific name and path object
        swagger.paths[localPathName] = pathObject;
    });
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
