//jshint esversion:6
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const ejs = require('ejs');

const app = express();


app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));


app.route('/')
  .get(function(req, res) {
    res.render('home');
  });

app.route('/register')
  .get(function(req, res) {
    res.render('register');
  });

app.route('/login')
  .get(function(req, res) {
    res.render('login');
  });



app.listen(3000, function() {
  console.log("Todo List Server Listing Todos");
});