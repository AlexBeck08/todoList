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

const ObjectId = Schema.Types.ObjectId;

const cardSchema = new Schema({
  listId: { type: ObjectId, ref: 'List' },
  cardTitle: String,
  date: { type: Date, default: Date.now }
});

const listSchema = new Schema({
  boardId: { type: ObjectId, ref: 'Board' },
  listTitle: String,
  cards: [cardSchema]
});

const boardSchema = new Schema({
  userId: { type: ObjectId, ref: 'User' },
  boardTitle: String,
  boardDescription: String,
  boardImage: String,
  lists: [listSchema]
});

const userSchema = new Schema({
  username: String,
  password: String,
  name: String,
  googleId: String,
  facebookId: String,
  boards: [boardSchema]
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);


const User = mongoose.model('User', userSchema);

const Board = mongoose.model('Board', boardSchema);

const List = mongoose.model('List', listSchema);

const Card = mongoose.model('Card', cardSchema);

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
    const boardsEjsOptions = {
      user: req.user,
      page_name: 'boards',
      boards: req.user.boards,
      boardIndex: req.params.boardIndex
    };

    if (req.isAuthenticated()) {
      if (req.params.userId == req.user._id) {
        res.render('boards', boardsEjsOptions);
      } else {
        res.send('This is not your board. ADD ERROR PAGE IN FUTURE');
      }
    } else {
      res.redirect('/login');
    }
  })
  .post(function(req, res) {
    const board = new Board({
      userId: req.params.userId,
      boardTitle: req.body.boardTitle,
      boardDescription: req.body.boardDescription,
      boardImage: req.body.boardImage
      // lists: []
    });
    Board.create(board, function(err, newBoard) {
      if (err) {
        console.log(err);
      } else { console.log(newBoard); }
    });
    User.findOne({ _id: req.params.userId }, function(err, user) {
      if (err) {
        console.log(err);
      } else {
        user.boards.push(board);
        user.save(function(err) {
          if (err) {
            console.log(err);
          } else {
            res.redirect('/' + req.params.userId + '/boards');
          }
        });
      }
    });
  });



app.route('/:userId/boards/:boardId')
  // **************   SHOW ALL BOARDS ****************
  .get(function(req, res) {
    let boardId = req.params.boardId;
    Board.findById(boardId, function(err, foundBoard) {
      const singleBoardEjsOptions = {
        user: req.user,
        userId: req.params.userId,
        page_name: 'singleBoard',
        board: foundBoard,
        boardId: boardId,
        lists: foundBoard.lists,
      };
      res.render('singleBoard', singleBoardEjsOptions);
    });
  })
  // *****************    EDIT A BOARD   *******************
  .patch(function(req, res) {
    let boardId = req.params.boardId;
    let updatedBoard = {
      boardTitle: req.body.boardTitle,
      boardDescription: req.body.boardDescription,
      boardImage: req.body.boardImage
    };
    Board.findByIdAndUpdate(boardId, updatedBoard,
      function(err, updatedBoard) {
        if (err) {
          console.log(err);
        } else {
          User.update({ 'boards._id': boardId }, { '$set': { 'boards.$.boardTitle': req.body.boardTitle, 'boards.$.boardDescription': req.body.boardDescription } }, function(err) {
            if (err) {
              console.log(err);
            } else {
              res.redirect('/' + req.user._id + '/boards');
            }
          });
        }
      });
  })
  //***************  DELETES A BOARD *******************8
  .delete(function(req, res) {
    let boardId = req.params.boardId;
    Board.findByIdAndDelete(boardId, function(err) {
      if (err) {
        console.log(err);
      } else {
        console.log('deleted board');
      }
    });
    User.findById(req.params.userId, function(err, foundUser) {
      if (err) {
        console.log(err);
      } else {
        foundUser.boards.pull({ _id: boardId });
        foundUser.save(function(err) {
          if (err) {
            console.log(err);
          } else {
            res.redirect('/' + req.user._id + '/boards');
          }
        });
      }
    });
  });



app.route('/:userId/boards/:boardId/edit')
  .get(function(req, res) {
    let boardId = req.params.boardId;
    Board.findById(boardId, function(err, foundBoard) {
      let editBoardEjsOptions = {
        user: req.user,
        page_name: 'singleBoard',
        board: foundBoard,
        boardId: boardId
      };
      res.render('editBoard', editBoardEjsOptions);
    });
  });

app.route('/:userId/boards/:boardId/lists/new')
  .post(function(req, res) {
    let boardId = req.params.boardId;
    Board.findById(boardId, function(err, foundBoard) {
      const list = new List({
        listTitle: req.body.listTitle,
        boardId: boardId
      });
      List.create(list, function(err, newList) {
        if (err) {
          console.log(err);
        } else {
          console.log(newList);
        }
      });
      foundBoard.lists.push(list);
      foundBoard.save(function(err) {
        if (err) {
          console.log(err);
        } else {
          res.redirect('/' + req.params.userId + '/boards/' + req.params.boardId);
        }
      });
    });
  });

app.route('/:userId/boards/:boardId/lists/:listId/edit')
  .patch(function(req, res) {
    let boardId = req.params.boardId;
    let listId = req.params.listId;
    let updatedList = {
      listTitle: req.body.listTitle,
    };
    List.findByIdAndUpdate(listId, updatedList,
      function(err, updatedList) {
        if (err) {
          console.log(err);
        } else {
          Board.update({ 'lists._id': listId }, { '$set': { 'lists.$.listTitle': req.body.listTitle } }, function(err) {
            if (err) {
              console.log(err);
            } else {
              res.redirect('/' + req.user._id + '/boards/' + boardId);
            }
          });
        }
      });
  });

app.route('/:userId/boards/:boardId/lists/:listId')
  .delete(function(req, res) {

    let boardId = req.params.boardId;
    let listId = req.params.listId;
    List.findByIdAndDelete(listId, function(err) {
      if (err) {
        console.log(err);
      } else {
        console.log('deleted List');
      }
    });
    Board.findById(boardId, function(err, foundBoard) {
      if (err) {
        console.log(err);
      } else {
        foundBoard.lists.pull({ _id: listId });
        foundBoard.save(function(err) {
          if (err) {
            console.log(err);
          } else {
            res.redirect('/' + req.user._id + '/boards/' + boardId);
          }
        });
      }
    });
  });

app.route('/:userId/boards/:boardId/lists/:listId/cards/new')
  .post(function(req, res) {
    const card = new Card({
      listId: req.params.listId,
      cardTitle: req.body.cardTitle,
    });
    Card.create(card, function(err, newCard) {
      if (err) {
        console.log(err);
      } else {
        // console.log(newCard);
      }
    });

    Board.findOne({ _id: req.params.boardId }, function(err, foundBoard) {
      const list = foundBoard.lists.id(req.params.listId);
      list.cards.push(card);
      foundBoard.save();
    });

    List.findOne({ _id: req.params.listId }, function(err, foundList) {
      if (err) {
        console.log(err);
      } else {
        foundList.cards.push(card);
        foundList.save(function(err) {
          if (err) {
            console.log(err);
          } else {
            // console.log(foundList.cards);
            res.redirect('/' + req.params.userId + '/boards/' + req.params.boardId);
          }
        });
      }
    });
  });

app.route('/:userId/boards/:boardId/lists/:listId/cards/:cardId')
  .delete(function(req, res) {
    const listId = req.params.listId;
    const cardId = req.params.cardId;
    const boardId = req.params.boardId;

    List.findById(listId, function(err, foundList) {
      if (err) {
        console.log(err);
      } else {
        foundList.cards.pull({ _id: cardId });
        foundList.save(function(err) {
          if (err) {
            console.log(err);
          }
        });
      }
    });
    Card.findByIdAndDelete(cardId, function(err) {
      if (err) {
        console.log(err);
      } else {
        console.log('deleted card');
      }
    });
    Board.findById(boardId, function(err, foundBoard) {
      if (err) {
        console.log(err);
      } else {
        const foundList = foundBoard.lists.id(listId);
        foundList.cards.pull({ _id: cardId });
        foundBoard.save(function(err) {
          if (err) {
            console.log(err);
          } else {
            res.redirect('/' + req.user._id + '/boards/' + boardId);
          }
        });
      }
    });
  });


app.listen(3000, function() {
  console.log("Todo List Server Listing Todos");
});