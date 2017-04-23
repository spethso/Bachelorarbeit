/**
 * TODOs:
 * - Correct response if maps do not contain key
 * - In stream POST: get messages out of JSON
 * - Out stream GET: not completely implemented yet
 * - Bi stream POST: not completely implemented yet
 */

/**
 * Module build the REST API based on a Swagger Object
 * @author spethso
 */
var swaggerObjects = require('./adapter.js');
var exportPaths = swaggerObjects.getPathObjects();
var express = require('express');
var app = express();
// Load proto file and grpc module
var PROTO_PATH = __dirname + '/webshop.proto';
//var PROTO_PATH = __dirname + '/main.proto';
var grpc = require('grpc');
var webshop_proto = grpc.load(PROTO_PATH).webshop; // TODO: Change to abstract service
var HashMap = require('hashmap');
const uuidV4 = require('uuid/v4');
var bodyParser = require('body-parser');
app.use(express.static('public'));
app.use(bodyParser.json());

var instances = new HashMap();
var responseMessages = new HashMap();
var requestMessages = new HashMap();

var client = new webshop_proto.WebShop('localhost:50051', grpc.credentials.createInsecure());

/**
 * Helping function to start gRPC operation
 */
function gRPCStart(obj, instanceID) {
    instances.get(instanceID).links = instanceID;
    var input = requestMessages.get(instanceID);
    if (obj.isStream == true) {
        // Create new array in responseMessages Map and add all response messages.
        responseMessages.set(instanceID, []);
        var call = client[obj.operation](input);
        // Retrieve responses
        call.on('data', function (responseObject) {
            console.log(responseObject);
            responseMessages.get(instanceID).push(responseObject);
        });
        // End response stream
        call.on('end', function () { });
    } else {
        // Retrieve 
        client[obj.operation](input, function (err, response) {
            if (err) {
                console.log('Error of operation ' + obj.operation);
                instance.error = err.message;
                console.log('Msg: ' + err.message);
            } else {
                // Add response to map
                console.log(response);
                responseMessages.set(instanceID, response);
            }
        });
    }
}

/**
 * POST of grpc operation 
 */
exportPaths.postObjects.forEach(function (obj) {
    app.post(obj.pathName, function (req, res) {
        var date = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        var start = req.query.start;
        var input = req.body.input;
        var instance = {
            id: uuidV4(),
            started: start,
            done: false,
            createdAt: date,
            startedAt: date,
            doneAt: '',
            error: '',
            links: ''
        };
        console.log('Instance:' + instance.id);
        instances.set(instance.id, instance);
        // TODO: If input stream add newline delimited String as objects into map
        requestMessages.set(instance.id, input);

        if (start == 'true') {
            gRPCStart(obj, instance.id);
        }
        res.end(JSON.stringify(instance));
    });
})

/**
 * GET/PATCH/DELETE of instance and DELETE of message
 */
exportPaths.getObjects.forEach(function (obj) {
    app.patch(obj.pathName, function (req, res) {
        console.log('TEST PATCH');
        var id = req.params.id;
        var instanceWritable = req.body.instance;
        if (instances.has(id)) {
            instances.get(id).started = instanceWritable.started;
            if (instanceWritable.started == true) {
                // Start gRPC operation
                gRPCStart(obj, id)
            }
        } else {
            console.log('There is no such instance!');
        }
        res.end(null); // TODO: correct response
    });

    app.get(obj.pathName, function (req, res) {
        console.log('Test GET');
        var id = req.params.id;
        var excludeOutput = false;
        if (obj.isStream == false) {
            // TODO: What todo with this?
            var excludeOutput = req.query.excludeOutput;
        }
        if (instances.has(id)) {
            var instance = instances.get(id);
            console.log(instances.get(id));
            if (obj.isStream == false) {
                res.send(JSON.stringify(responseMessages.get(instance.links)));
            }
            // TODO: How to get data, if out stream exists? Maybe also return string representation of array?
            res.end(JSON.stringify(instance));
        } else {
            console.log('There is no such instance!');
            res.end(null); // TODO: correct response
        }
    });

    app.delete(obj.pathName, function (req, res) {
        console.log('TEST DELETE INSTANCE');
        var id = req.params.id;
        if (instances.has(id)) {
            var instance = instances.get(id);
            if (instance.done == true || instance.error != '') {
                instances.remove(id);
                var msg = responseMessages.get(instance.links);
                responseMessages.remove(instance.links);
                console.log('Delete finished');
                // res.send(JSON.stringify(msg)); TODO: Difference with stream?
                res.end(JSON.stringify(instance));
            } else {
                console.log('The operation is not finished yet');
            }
        } else {
            console.log('There is no such instance!');
        }
    });
});

/**
 * PUT for gRPC operations without request stream
 */
exportPaths.noInStreamObjects.forEach(function (obj) {
    app.put(obj.pathName, function (req, res) {
        console.log('TEST PUT');
        var id = req.params.id;
        var value = req.body.value;
        var pathArray = obj.pathName.split('/'); // fieldname is the last element
        if (instances.has(id)) {
            var messageID = instances.get(id).links;
            if (requestMessages.has(messageID)) {
                requestMessages.get(messageID)[pathArray[pathArray.length - 1]] = value;
                console.log(requestMessages.get(messageID));
            } else {
                console.log('There is no such message!')
            }
        } else {
            console.log('There is no such instance!');
        }
        res.end(null); // TODO: correct response
    });
});

/**
 * GET for field values - for gRPC operations without response stream
 */
exportPaths.noOutStreamObjects.forEach(function (obj) {
    app.get(obj.pathName, function (req, res) {
        console.log('TEST GET FIELD')
        var id = req.params.id;
        var pa = obj.pathName.split('/');
        if (instances.has(id)) {
            var messageID = instances.get(id).links;
            console.log(responseMessages.get(messageID)[pa[pa.length - 1]]);
            res.end(JSON.stringify(responseMessages.get(messageID)[pa[pa.length - 1]]));
        } else {
            console.log('There is no such instance!')
            res.end(null); // TODO: correct response?
        }
    });
});


/**
 * GET for complete response message of gRPC operations without response stream
 */
exportPaths.noOutStreamObjectsMessage.forEach(function (obj) {
    app.get(obj.pathName, function (req, res) {
        console.log('TEST GET OUT')
        var id = req.params.id;
        if (instances.has(id)) {
            var messageID = instances.get(id).links;
            res.end(JSON.stringify(responseMessages.get(messageID)));
        } else {
            console.log('There is no such instance!');
            res.end(null); // TODO: correct response?
        }
    });
});

/**
 * POST for input stream request messages
 */
exportPaths.inStreamObjects.forEach(function (obj) {
    app.post(obj.pathName, function (req, res) {
        console.log('TEST POST IN STREAM');
        var id = req.params.id;
        var stream = req.body.stream;
        // TODO: Get messages out of newline-delimited JSON and add to requestMessages
        // If operation already started, end this function while doing nothing.
    });
});

/**
 * GET for output stream response messages
 */
exportPaths.outStreamObjects.forEach(function (obj) {
    app.get(obj.pathName, function (req, res) {
        console.log('TEST GET OUT STREAM');
        var id = req.params.id;
        // TODO: Response as newline-delimited JSON
    });
});

/**
 * POST for bidirectional stream. Send request messages and get response messages
 */
exportPaths.biStreamObjects.forEach(function (obj) {
    app.post(obj.pathName, function (req, res) {
        console.log('TEST GET BI STREAM');
        var id = req.params.id;
        var stream = req.body.stream;
        /*
        * If gRPC operation is not started yet, get messages out of 
        * newline-delimited JSON and add them to requestMessages map.
        * Otherwise end this function.
        */
        /*
        * Add response messages to newline-delimited JSON and send it.
        */
    });
});

//--------------------------------------------------------------

app.get('/', function (req, res) {
    res.sendFile(__dirname + "/index.htm");
});

var server = app.listen(8081, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("REST server listening at http://%s:%s", host, port);
})