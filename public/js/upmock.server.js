
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

  function deleteDoc(e, details) {
    e.preventDefault();
    $.ajax({
      type: 'DELETE',
      url: '/user/' + window.UpMock.user.name + '/' + details.id + '/',
      data: ''
    }).then(function() {
      $(e.target).parents('li').remove();
    });
  }

  function logout() {
    $.ajax({
      type: 'DELETE',
      url: '/couch/_session'
    }).then(function() {
      document.location.href = '/';
    });
  }

  function login(e, details) {

    e.preventDefault();

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
      showWarning('#login', "Error Logging in");
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
      showWarning('#register', obj.error);
    });
  }

  function showWarning(id, msg) {
    $(".warning").remove();
    $('<p class="warning">' + msg + '</p>').prependTo(id);
  }

  function create(e, details) {

    var docName = details.name;
    var url = '/user/' + self.user.name + '/' + docName + '/';

    $.ajax({
      type: 'POST',
      url: '/user/' + self.user.name + '/create',
      data: JSON.stringify({name: docName})
    }).then(function() {
      document.location.href = '/user/' + self.user.name + '/' + docName + '/';
    }).fail(function(xhr) {
      var json = JSON.parse(xhr.responseText);
      if (xhr.status !== 201) {
        return showWarning('#create_upmock', json.reason);
      }
    });
  }

  // Trail.Router.pre(function(args) {
  //   if (args.path === '#login') {
  //     return true;
  //   }

  //   if (self.user === false) {
  //     LoggedOutView.render();
  //     return false;
  //   }

  //   LoggedInView.render({data: self.user});
  //   return true;
  // });

  // Trail.Router.get(/^#(\/)?$/, HomeView, HomeView.show);

  Trail.Router.post('#create', this, create);
  Trail.Router.post('#delete', this, deleteDoc);
  Trail.Router.post('#logout', this, logout);
  Trail.Router.post('#login', this, login);
  Trail.Router.post('#register', this, register);


  $.get("/couch/_session", function(data) {
    self.user = !data.userCtx.name ? false : {name: data.userCtx.name};
  }, "json").then(function() {
    var tpl = !!self.user ? '#logged_in_tpl' : '#logged_out_tpl';
    $('#user').html($(tpl).html());
    if (user) {
      $('#homelink').attr('href', '/user/' + self.user.name + '/')
        .text(self.user.name);
    }
    Trail.Router.init();
  });

};

window.UpMock = new UpMock();