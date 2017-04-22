
var PROTO_PATH = __dirname + '/webshop.proto';
var grpc = require('grpc');
var webshop_proto = grpc.load(PROTO_PATH).webshop;
var fs = require('fs');
var HashMap = require('hashmap');


var products =  new HashMap();
var product_availability = new HashMap();
var orders = new HashMap();
var customers = new HashMap();

// listProducts(ListProductsParams) returns (stream Product);
function listProducts(call) {
  var limit = call.request.limit;
  limit = Math.min(limit, products.count());
  console.log('Retrieving ' + limit + ' products');
  for (var i = 0; i < limit; i++) {
    call.write(products.values()[i]);
  }
  call.end();
}


// checkAvailability(ProductId) returns (Availability);
function checkAvailability(call, callback) {
  console.log('checking availability for id ' + call.request.id);
  if (products.has(call.request.id)) {
    callback(null, {available:product_availability.get(call.request.id) > 0});
  } else {
    callback({ code: grpc.status.NOT_FOUND, details: 'Product not found' });
  }
}


// storeOrderDetails(Order) returns (OrderId);
function storeOrderDetails(call, callback) {
  var id = call.request.id;
  if(id === '') {
    // maybe not very robust ..
    id = orders.count().toString();
    call.request.id = id;
  }
  var productsExist = call.request.products.every(productId => {
    if(!products.has(productId.id)){
      console.log('Product mentioned in order does not exist');
      callback({ code: grpc.status.NOT_FOUND, details: 'Product with id "' + productId.id + '" not found' });
      return false;
    }
    return true;
  });
  console.log(productsExist)
  if(productsExist) {
    orders.set(id, call.request);
    callback(null, {id: id});
    console.log('stored order details with id: \"' + id + "\"");
  }
}


// getOrderDetails(OrderId) returns (Order);
function getOrderDetails(call, callback) {
  console.log('retrieving order details');
  var id = call.request.id;
  if(orders.has(id)){
    callback(null, orders.get(id));
  } else {
    callback({ code: grpc.status.NOT_FOUND, details: 'Order not found' });
  }
}


// cancelOrder(OrderId) returns (Order);
function cancelOrder(call, callback) {
  console.log('canceling order');
  var id = call.request.id;
  if(orders.has(id)){
    var order = orders.get(id);
    order.status = "CANCELED";
    callback(null, order);
  } else {
    callback({ code: grpc.status.NOT_FOUND, details: 'Order not found' });
  }
}


function _calcTransactionCosts(order) {
  var amount = 0;
  order.products.forEach(productId => {
    amount += products.get(productId.id).price;
  });
  return amount;
}


function _calcShipmentCosts(order) {
  var amount = 0;
  order.products.forEach(productId => {
    amount += 1;
  });
  return amount;
}


// calcTransactionCosts(OrderId) returns (Costs);
function calcTransactionCosts(call, callback) {
  var id = call.request.id;
  console.log('calculating shipping costs for order ', id);
  if(orders.has(id)){
    var order = orders.get(id);
    console.log({costs: _calcTransactionCosts(order)})
    callback(null, {costs: _calcTransactionCosts(order)});
  } else {
    callback({ code: grpc.status.NOT_FOUND, details: 'Order not found' });
  }
}


// conductPayment(Payment) returns (Order);
function conductPayment(call, callback) {
  console.log('conducting payment');
  var orderId = call.request.id;
  if(orders.has(orderId.id)){
    var order = orders.get(orderId.id);

    var amountDue = _calcShipmentCosts(order) + _calcTransactionCosts(order);
    if(call.request.amount < amountDue){
      callback({ code: grpc.status.FAILED_PRECONDITION, details: 'Amount does not match costs' });
    } else {
      order.status = "PAYED";
      callback(null, order);
    }
  } else {
    callback({ code: grpc.status.NOT_FOUND, details: 'Order not found' });
  }
}


// calcShipmentCosts(OrderId) returns (Costs);
function calcShipmentCosts(call, callback) {
  var id = call.request.id;
  console.log('calculating shipping costs');
  if(orders.has(id)){
    var order = orders.get(id);
    callback(null, {costs: _calcShipmentCosts(order)});
  } else {
    callback({ code: grpc.status.NOT_FOUND, details: 'Order not found' });
  }
}


// shipProducts(OrderId) returns (Order);
function shipProducts(call, callback) {
var id = call.request.id;
  console.log('shipping products');
  if(orders.has(id)){
    var order = orders.get(id);
    if(order.status === 'PAYED'){
      order.products.forEach(productId => {
        product_availability.set(productId.id, product_availability.get(productId.id) - 1);
      });
      order.status = 'SHIPPED';
      callback(null, order);
    } else if (order.status === 'SHIPPED') {
      callback({ code: grpc.status.FAILED_PRECONDITION, details: 'Order is already shipped' });
    } else {
      callback({ code: grpc.status.FAILED_PRECONDITION, details: 'Order is not payed yet' });
    }
  } else {
    callback({ code: grpc.status.NOT_FOUND, details: 'Order not found' });
  }
}


function main() {
  var json_products = JSON.parse(fs.readFileSync(__dirname + '/products.json',
                                                 'utf8'));
  for (var i = 0; i < json_products.length; i++) {
    products.set(json_products[i].id, json_products[i]);
    product_availability.set(json_products[i].id,
                             Math.floor(Math.random() * 50) + 25);
  }
  console.log('Starting server with ' + products.count() + ' products');
  var server = new grpc.Server();
  server.addProtoService(webshop_proto.WebShop.service, {
    listProducts: listProducts,
    checkAvailability: checkAvailability,
    storeOrderDetails: storeOrderDetails,
    getOrderDetails: getOrderDetails,
    cancelOrder: cancelOrder,
    calcTransactionCosts: calcTransactionCosts,
    conductPayment: conductPayment,
    calcShipmentCosts: calcShipmentCosts,
    shipProducts: shipProducts,
  });
  server.bind('0.0.0.0:50051', grpc.ServerCredentials.createInsecure());
  server.start();
}

main();
