/**
 * TODOs:
 * - Start gRPC operations and safe responses in Map
 * - Change query parameters from path to query
 * - PATCH: Maybe start gRPC operation, if started is set to true
 * - Instances GET: Add optional second parameter and alternative response
 * - PUT: Routing does not work. Rest is not complete
 * - Field GET: Need to be tested
 * - Out GET: Need to be tested
 * - In stream POST: not implemented yet
 * - Out stream GET: not implemented yet
 * - Bi stream POST: not implemented yet
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
var bodyParser = require('body-parser');
app.use(express.static('public'));
app.use(bodyParser.json());

var instances = new HashMap();
var responseMessages = new HashMap();
//var client = new webshop_proto.WebShop('localhost:50051', // TODO: get PORT
//                                         grpc.credentials.createInsecure());

/**
 * POST of grpc operation 
 */
exportPaths.postObjects.forEach(function (obj) {
    app.post(obj.pathName + '/:start', function(req, res) {
        var date = new Date();
        var actualDate = date.getDay() + '.' + date.getDate() + '.' + date.getFullYear();
        var start = req.params.start;
        var input = req.body.input;
        var instance = {
                id: new String(date.getTime()), //TODO: uID
                started: start,
                done: false,
                createdAt: actualDate,
                startedAt: actualDate,
                doneAt: '',
                error: '',
                links: ''
        };
        console.log('Instance:' + instance.id);
        instances.set(instance.id, instance);

        if (start == 'true') {
            // Only for test purpose
            instances.get(instance.id).links = instance.id;
            var msg = {
                limit: '10'
            };
            responseMessages.set(instance.links, msg);
            console.log('Message added');
            // client[obj.operation](input, function(err, response) {
            //     if (err) {
            //         console.log('Error of operation ' + obj.operation);
            //         instance.error = err.message;
            //     } else {
            //         // TODO: response of add to Map
            //         res.end(response);
            //     }
            // });
        }
    });
})

/**
 * GET of instance
 */
exportPaths.getObjects.forEach(function (obj) {
    app.patch(obj.pathName, function(req, res) {
        console.log('TEST PATCH');
        var id = req.params.id;
        var instanceWritable = req.body.instance;
        if (instances.has(id)) {
            instances.get(new String(id)).started = instanceWritable.started;
            // TODO: Maybe start grpc operation
        } else {
            console.log('There is no such instance!');
        }
    });

    app.get(obj.pathName, function(req, res) {
        console.log('Test GET');
        var id = req.params.id;
        console.log(instances.get(id));
        res.end(JSON.stringify(instances.get(id)));
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
        // TODO: Change value of in field
        var messageID = instances.get(id).links;
        if (responseMessages.has(messageID)) {
            responseMessages.get(messageID)[pathArray[pathArray.length - 1]] = value;
            console.log(responseMessages.get(messageID));
        } else {
            console.log('There is no such message!')
        }
    });
});

/**
 * GET for field values - for gRPC operations without response stream
 */
exportPaths.noOutStreamObjects.forEach(function (obj) {
    app.get(obj.pathName, function (req, res) {
        var id = req.params.id;
        var messageID = instances.get(id).links;
        var pa = obj.pathName.split('/');
        res.end(JSON.stringify(responseMessages.get(messageID)[pa[pa.length - 1]]));
    });
});


/**
 * GET for complete response message of gRPC operations without response stream
 */
exportPaths.noOutStreamObjectsMessage.forEach(function (obj) {
    app.get(obj.pathName, function (req, res) {
        var id = req.params.id;
        var messageID = instances.get(id).links;
        res.end(JSON.stringify(responseMessages.get(messageID)));
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