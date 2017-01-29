
/**
 * Module to map proto to swagger
 * @author spethso
 */
var fs = require('fs');
var proto = require('./protoData.js');
var protoData = proto.getData();
// Proto package
var package = protoData.package;
// Service operations
var operations = protoData.operations;
// Proto messages
var messages = protoData.messages;

var stdParam = {
    name: 'start',
    in: 'query',
    type: 'boolean',
    default: true
};

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

var idParam = {
    name: 'id',
    in: 'path',
    description: 'Unique identifier of instance',
    required: true,
    type: 'string'
};

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
    var operation = operations[0];
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

    // Operation path with form
    pathName += '/form';
    pathObject = {
        post: {
            summary: operation.name,
            consumes: ['multipart/form-data'],
            parameters: [
                stdParam,
                {
                    name: '', // TODO: PLACEHOLDER_FIELD_NAME
                    in: 'formData',
                    type: 'TODO' // TODO derive from proto
                }
            ],
            responses: response_202
        }
    };
    // Add path to paths with specific name and path object
    swagger.paths[pathName] = pathObject;

    // Operation on instances
    pathName += '/instances/{id}';
    var paramArray = [idParam];
    var res = {
        '200': 'Instance resource',
        schema: { $ref: '#/definitions/Instance' }
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
            '200': 'Instance resource',
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
        };
    }
    pathObject = {
        patch: {
            summary: 'Update instance resource',
            consumes: ['application/json'],
            parameters: [
                idParam,
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
            parameters: paramArray
        },
        tags: ['Instances'],
        responses: res
    };
    // Add path to paths with specific name and path object
    swagger.paths[pathName] = pathObject;
}

function main() {
    // console.log(operations[0].request.name)
    getPaths();
    console.log(swagger.paths);
}

main();
