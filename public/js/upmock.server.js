
window.log = function() {
  log.history = log.history || [];
  log.history.push(arguments);
  if(this.console){
    console.log( Array.prototype.slice.call(arguments) );
  }
};


$.ajaxSetup({
  cache: false,
  contentType: 'application/json'
});

$.couch.urlPrefix = "/couch";

$.couch.db("mydatabase");

var nil = function() { };

// Basic wrapper for localStorage
var localJSON = (function(){
  if (!localStorage) {
    return false;
  }
  return {
    set: function(prop, val) {
      localStorage.setItem(prop, JSON.stringify(val));
    },
    get: function(prop, def) {
      return JSON.parse(localStorage.getItem(prop) || 'false') || def;
    },
    remove: function(prop) {
      localStorage.removeItem(prop);
    }
  };
})();


var LoggedOutView = Trail.View.extend({
  container: '#content',
  template: '#logged_out_tpl'
});
var LoggedInView = Trail.View.extend({
  container: '#user',
  template: '#logged_in_tpl'
});

var HomeView = Trail.View.extend({
  container: '#content',
  template: '#home_tpl',
  show: function() {
    var self = this;
    var db = 'upmock-' + window.UpMock.user.name;
    $.couch.db(db).allDocs({}).then(function(data) {
      self.render({data: {
        user: window.UpMock.user,
        saved: data
      }});
    });
  }
});

var UpMock = function() {

  var self = this;

  self.user = false;

  function logout() {
    $.ajax({
      type: 'DELETE',
      url: '/couch/_session'
    }).then(function() {
      document.location.reload();
    });
  }

  function login(e, details) {
    var credentials = {
      user: details.username,
      password: details.password
    };

    $.ajax({
      type: 'POST',
      url: '/login',
      data: JSON.stringify(credentials)
    }).then(function(data) {
      document.location = '/user/' + details.username + '/';
    }).fail(function(data) {
      showWarning('#login_wrapper', "Error Logging in");
    });
  }

  function register(e, details) {
    var credentials = {
      user: details.username,
      password: details.password,
      confirm_password: details.confirm_password
    };

    $.ajax({
      type: 'POST',
      url: '/register',
      data: JSON.stringify(credentials)
    }).then(function(data) {
      document.location = '/user/' + details.username + '/';
    }).fail(function(data) {
      var obj = JSON.parse(data.responseText);
      showWarning('#register_wrapper', obj.error);
    });
  }

  function showWarning(id, msg) {
    $(".warning").remove();
    $(id).find('form').prepend('<p class="warning">' + msg + '</p>');
  }

  function renderUserPanel(callback) {
  }

  function create(e, details) {

    var docName = details.name;
    var $db = $.couch.db('upmock-' + self.user.name);
    var url = '/user/' + self.user.name + '/' + docName + '/';

    $db.openDoc(docName, {error: nil}).then(function() {
      var html = 'A design with that name already exists, ' +
        '<a href="' + url + '">open it?</a>';
      $('<div class="warning">' + html + '</div>').prependTo('#create_upmock');
    }).fail(function(xhr) {
      $db.saveDoc({_id: docName}).always(function(doc, _, xhr) {
        if (xhr.status === 201) {
          document.location = url;
        }
      });
    });
  }

  Trail.Router.pre(function(args) {
    if (args.path === '#login') {
      return true;
    }

    if (self.user === false) {
      LoggedOutView.render();
      return false;
    }

    LoggedInView.render({data: self.user});
    return true;
  });

  Trail.Router.get(/^#(\/)?$/, HomeView, HomeView.show);

  Trail.Router.post('#create', this, create);
  Trail.Router.post('#logout', this, logout);
  Trail.Router.post('#login', this, login);
  Trail.Router.post('#register', this, register);


  $.get("/couch/_session", function(data) {
    self.user = !data.userCtx.name ? false : {name: data.userCtx.name};
  }, "json").then(function() {
    Trail.Router.init();
  });

};

window.UpMock = new UpMock();