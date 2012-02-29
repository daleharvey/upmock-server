var fs = require('fs');
var config = JSON.parse(fs.readFileSync('./config.json').toString());

var couchAuthUrl = 'http://' +
  config.couch.admin.name + ':' + config.couch.admin.pass + '@' +
  config.couch.host + ':' + config.couch.port;

var couchUrl = 'http://' +
  config.couch.host + ':' + config.couch.port + '/';

var nano = require('nano')(couchAuthUrl);
var express = require('express');
var http = require('http');
var hashlib = require("hashlib");
var _ = require('underscore');
var r = require('request').defaults({
  jar: false,
  json: true
});

var app = express.createServer();

var FREE_LIMIT = 3;

var Handlebars = require('handlebars');

Handlebars.registerHelper('decode', function(str) {
  return decodeURIComponent(str);
});

var parse = express.bodyParser();

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.register('.html', Handlebars);
  app.set('view engine', 'handlebars');
  app.set("view options", { layout: false });
  app.use(function(req, res, next) {
    if (0 === req.url.indexOf('/couch')) {
      return next();
    }
    parse(req, res, next);
  });
});

app.get('/', function(_, res) {
  renderIndex(res, '/views/home.tpl', {bodyClass: 'home'});
});

app.get('/earlybird', function(_, res) {
  renderIndex(res, '/views/earlybird.tpl', {});
});


app.get('/fonts/', function(_err, res) {

  fs.stat(__dirname + '/fonts.json',  function (stat_error, stat) {

    if (stat && stat.isFile()) {
      return res.sendfile(__dirname + '/fonts.json');
    }

    var googleApiUrl = 'https://www.googleapis.com/webfonts/v1/webfonts?key=';
    var typeKitApiUrl = 'https://typekit.com/api/v1/json/libraries/full?per_page=500';

    var googleFonts = null;
    var typekitFonts = null;

    r.get({url: googleApiUrl + config.googleApiKey}, function(err, resp, body) {
      googleFonts = body;
      complete();
    });

    r.get({url: typeKitApiUrl}, function (err, resp, body) {
      typekitFonts = body;
      complete();
    });

    function complete() {
      if (googleFonts && typekitFonts) {
        var t1 = _.map(typekitFonts.library.families, function(x) {
          return {'id': x.id, 'family': x.name, 'source': 'typekit'};
        });
        var t2 = _.map(googleFonts.items, function(x) {
          return {'id': x.family, 'family':x.family, 'source':'google'};
        });

        var result = t1.concat(t2);

        fs.writeFile(__dirname + '/fonts.json', JSON.stringify(result), function(err) {
          if (!err) {
            console.log('saved font cache');
          }
        });

        return reply(res, 200, result);
      }
    }

  });
});


app.get('/user/:userId/', function(req, res) {
  nano.request({
    db: 'upmock-' + req.user.userCtx.name,
    doc: '_all_docs',
    headers: {'cookie': req.headers.cookie || ''}
  }, function(err, body) {
    renderIndex(res, '/views/user.tpl', {
      user_id: req.user.userCtx.name,
      saved: body
    });
  });
});


// If the user is logged in, serve the app, if not serve a preview
// TODO: give option to make private
app.get('/user/:user/:db/', function(req, res) {
  r.get({
    uri: couchUrl + '_session',
    headers: {'cookie': req.headers.cookie || ''}
  }, function(err, resp, body) {
    if (resp.statusCode === 200 && body.userCtx.name === req.params.user) {
      return res.sendfile(__dirname + '/public/upmock.html');
    }
    nano.use('upmock-' + req.params.user).get(req.params.db, null, function(err, doc) {
      res.render('preview.html', {html: doc.html});
    });
  });
});

app.delete('/user/:userId/:db/', function(req, res) {
  var userDb = nano.use('upmock-' + req.user.userCtx.name);
  var docName = req.params.db;
  userDb.get(docName, null, function(err, doc) {
    userDb.destroy(docName, doc._rev, function() {
      return reply(res, 200, {ok: true});
    });
  });
});


app.post('/user/:userId/create', function(req, res) {

  var docName = req.body.name;
  var name = req.user.userCtx.name;
  var userDb = nano.use('upmock-' + name);

  nano.request({db: '_users', doc: 'org.couchdb.user:' + name}, function(_, user) {
    userDb.get('', function(_, db) {

      if (db.doc_count + 1 > FREE_LIMIT && user.state !== 'active_paid') {
        return reply(res, 403, {
          error: 'account_limit',
          reason: 'Free Accounts are limited to 3 mockups'
        });
      }

      if (!/^[A-Za-z0-9_ ]{3,20}$/.test(docName)) {
        return reply(res, 400, {
          error: 'invalid_name',
          reason: 'Invalid mockup name'
        });
      }

      userDb.insert({}, docName, function(err, _, write) {
        if (write['status-code'] === 201) {
          return reply(res, 201, {ok: true});
        } else {
          return reply(res, 400, {
            error: 'doc_exists',
            reason: 'A mockup with that name already exists'
          });
        }
      });
    });
  });
});


// Proxy login requests to couch
app.post('/login', function(req, client) {

  var post = req.body;
  post.user = post.user.toLowerCase();

  loginRequest(post.user, post.password, function(err, res, body) {
    if (res.statusCode === 401) {
      reply(client, 401, {error: 'invalid login'});
    } else {
      reply(client, 200, {ok: true}, {'Set-Cookie': res.headers['set-cookie']});
    }
  });

});


// Register a user, check their name isnt taken and if not, create a new
// user, create a database for them and setup security
// This needs retry mechanisms built in, other failures are transient but if
// this fails then it can be left inconsistent
app.post('/register', function(req, client) {

  var post = req.body;
  post.user = post.user.toLowerCase();

  var users = nano.use('_users');
  var name = post.user;
  var userName = 'org.couchdb.user:' + post.user;

  console.log('REGISTRATION: ' + post.user);

  areValidCredentials(users, userName, post, function(areValid, reason) {

    if (!areValid) {

      reply(client, reason.status, reason.json);

    } else {
      createUserDoc(userName, name, post.password, function(user_doc) {

        users.insert(user_doc, function(err, body, hdrs) {

          if (err) {
            return reply(client, 503, {error: 'unknown'});
          }

          loginRequest(post.user, post.password, function(error, res, body) {
            createAccount(name, function(err) {
              if (err) {
                return reply(client, 501, {error: 'unknown'});
              }
              reply(client, 201, {ok: true}, {
                'Set-Cookie': res.headers['set-cookie']
              });
            });
          });
        });
      });
    }
  });
});

// Proxy all requests from /couch/* to the root of the couch host
app.get('/couch/_session', proxy);
app.delete('/couch/_session', proxy);
app.get('/couch/:username/:docname', proxy);
app.put('/couch/:username/:docname', proxy);

app.get('*', function(req, res) {
  res.sendfile(__dirname + '/public' + req.params[0]);
});


// If the request is asking for a valid id, lookup the session to make
// sure they are logged in (with the right name)
app.param('userId', function(req, res, next, id) {
  id = id.toLowerCase();
  r.get({
    uri: couchUrl + '_session',
    headers: {'cookie': req.headers.cookie || ''}
  }, function(err, resp, body) {
    if (resp.statusCode !== 200 || body.userCtx.name !== id) {
      return  renderIndex(res, '/views/401.tpl', {});
    }
    req.user = body;
    req.user.userCtx.name = req.user.userCtx.name.toLowerCase();
    next();
  });
});


function proxy(req, res) {
  req.pipe(r(couchUrl + req.url.slice(7))).pipe(res);
}


function renderIndex(res, content, tpldata) {
  fs.readFile(__dirname + content, function(err,data) {
    var tmp = Handlebars.compile(data.toString());
    res.render('index.html', {
      content: tmp(tpldata),
      bodyClass: tpldata.bodyClass || ''
    });
  });
}


function reply(client, status, content, hdrs) {
  var headers = _.extend({'Content-Type': 'application/json'}, hdrs);
  client.writeHead(status, headers);
  client.end(JSON.stringify(content));
}


function loginRequest(username, password, callback) {
  r.post({
    json: false,
    uri: couchUrl + '_session',
    body: 'name=' + username + '&password=' + password,
    headers: {'content-type': 'application/x-www-form-urlencoded' }
  }, callback);
}

function createUserDoc(id, name, password, callback) {
  nano.request({db: "_uuids"}, function(_, uuids) {
    var salt = uuids.uuids[0];
    callback({
      _id: id,
      name: name,
      type: 'user',
      roles: [],
      salt: salt,
      password_sha: hashlib.sha1(password + salt)
    });
  });
}

// Ensure the users database exists and has the correct
// security credentials
function createAccount(name, callback) {

  nano.request({
    db: 'upmock-' + name,
    method: 'PUT',
    headers: {'cookie': null}
  }, function (error, body, headers) {

    if (!(headers['status-code'] === 201 || headers['status-code'] === 412)) {
      return callback(new Error('screwed'));
    }

    var security = {
      admins: { names: [name], roles: []},
      readers: { names: [name], roles: []}
    };

    nano.request({
      method: 'PUT',
      db: 'upmock-' + name,
      path: '_security',
      body: security
    }, function(err, body, hdrs) {
      if (hdrs['status-code'] !== 200) {
        throw(err);
      }
      if (callback) {
        callback(null);
      }
    });

  });
}

function areValidCredentials(usersTable, id, post, callback) {

  if (post.password !== post.confirm_password) {
    callback(false, {status: 400, json: {error: 'Passwords do not match'}});

  } else if (!/^[A-Za-z0-9_]{3,20}$/.test(post.user)) {
    callback(false, {status: 400, json: {
      error: 'Invalid username'
    }});

  } else if (!/^[A-Za-z0-9_]{3,20}$/.test(post.password)) {
    callback(false, {status: 400, json: {
      error: 'Invalid password'
    }});

  } else {
    usersTable.get(id, function(err, _, res) {
      if (res['status-code'] === 200) {
        callback(false, {status: 409, json: {error: 'Username is in use'}});
      } else {
        callback(true);
      }
    });
  }
}

app.listen(config.node.port);
console.log('Server running at http://' + config.node.host + ':' + config.node.port);
