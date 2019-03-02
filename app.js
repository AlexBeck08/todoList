//jshint esversion:6
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const findOrCreate = require('mongoose-findorcreate');
var methodOverride = require('method-override');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;

const app = express();
const saltRounds = 10;


app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(methodOverride('_method'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect('mongodb://localhost:27017/todoUsersDB', { useNewUrlParser: true });

const Schema = mongoose.Schema;

const userSchema = new Schema({
  username: String,
  password: String,
  name: String,
  googleId: String,
  facebookId: String,
  boards: [{
    boardTitle: String,
    boardDescription: String,
  }]
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);


const User = mongoose.model('User', userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/todo",
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id, name: profile.name.givenName }, function(err, user) {
      console.log(profile);
      return cb(err, user);
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/todo"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id, name: profile.displayName }, function(err, user) {
      return cb(err, user);
    });
  }
));

app.route('/')
  .get(function(req, res) {

    res.render('home', { user: req.user, page_name: 'home' });
  });

app.route('/register')
  .get(function(req, res) {
    res.render('register', { user: req.user, page_name: 'register' });
  })
  .post(function(req, res) {
    User.register({ username: req.body.username, name: req.body.name }, req.body.password, function(err, user) {
      if (err) {
        console.log(err);
        res.redirect('/register');
      } else {
        passport.authenticate('local')(req, res, function() {
          res.redirect('/home');
        });
      }
    });
  });

app.route('/login')
  .get(function(req, res) {
    res.render('login', { user: req.user, page_name: 'login' });
  })
  .post(function(req, res) {
    const user = new User({
      username: req.body.username,
      password: req.body.password
    });

    req.login(user, function(err) {
      if (err) {
        console.log(err);
        res.redirect('/login');
      } else {
        passport.authenticate('local')(req, res, function() {
          res.redirect('/home');
        });
      }
    });
  });

app.route('/logout')
  .get(function(req, res) {
    req.logout();
    res.redirect('/');
  });

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] }));

app.get('/auth/google/todo',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/home');
  });

app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/todo',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/home');
  });

app.route('/home')
  .get(function(req, res) {
    if (req.isAuthenticated()) {
      res.redirect('/' + req.user._id + '/boards');
    } else {
      res.redirect('/login');
    }
  });

app.route('/:userId/boards')
  .get(function(req, res) {
    if (req.isAuthenticated()) {
      if (req.params.userId == req.user._id) {
        res.render('boards', { user: req.user, page_name: 'boards', boards: req.user.boards, boardIndex: req.params.boardIndex });
      } else {
        res.send('This is not your board. ADD ERROR PAGE IN FUTURE');
      }
    } else {
      res.redirect('/login');
    }
  })
  .post(function(req, res) {
    const newBoard = { boardTitle: req.body.boardTitle, boardDescription: req.body.boardDescription };
    User.findOneAndUpdate({ _id: req.user._id }, { $push: { boards: newBoard } }, function(err, updatedUser) {
      if (err) {
        console.log(err);
        res.send('there was an error');
      } else {
        res.redirect('/' + req.user._id + '/boards');
      }
    });
  });



app.route('/:userId/boards/:boardIndex')
  .get(function(req, res) {
    res.render('singleBoard', { user: req.user, page_name: 'singleBoard', boards: req.user.boards, boardIndex: req.params.boardIndex });
  })
  .patch(function(req, res) {
    let boardIndex = req.params.boardIndex;
    let currentBoardId = req.user.boards[boardIndex]._id;
    let updatedBoard = { boardTitle: req.body.boardTitle, boardDescription: req.body.boardDescription };
    console.log(req.user);
    User.findOneAndUpdate({ _id: req.user._id, "boards._id": currentBoardId }, { $set: { 'boards.$': updatedBoard } }, function(err, updatedBoard) {
      if (err) {
        console.log(err);
        res.send('there was an error');
      } else {
        res.redirect('/' + req.user._id + '/boards');
      }
    });
  })
  .delete(function(req, res) {
    console.log(req.body);
    let boardIndex = req.params.boardIndex;
    let currentBoardId = req.user.boards[boardIndex]._id;
    User.update({ _id: req.user._id }, {
      $pull: { boards: { _id: currentBoardId } }
    }, function(err) {
      if (err) {
        console.log(err);
      } else {
        res.redirect('/' + req.user._id + '/boards');
      }
    });
  });



app.route('/:userId/boards/:boardIndex/edit')
  .get(function(req, res) {
    res.render('editBoard', { user: req.user, page_name: 'singleBoard', boards: req.user.boards, boardIndex: req.params.boardIndex });
  });



app.listen(3000, function() {
  console.log("Todo List Server Listing Todos");
});