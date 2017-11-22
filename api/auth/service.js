const _ = require ('lodash');
var crypto = require('crypto');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const uuid = require('uuid');
const log = require('blue-ox')('app:auth:service');
const db = require('../../db');
const dao = require('./dao')(db);

const baseUser = {
  isAdmin: false,
  isAgencyAdmin: false,
  disabled: false,
  passwordAttempts: 0,
  completedTasks: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const basePassport = {
  protocol: 'local',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function validatePassword (password, username) {
  var notUsername = password.toLowerCase().trim() !== username.split('@',1)[0].toLowerCase().trim();
  var minLength = password.length >= 8;
  var lowercase = /[a-z]/.test(password);
  var uppercase = /[A-Z]/.test(password);
  var number = /[0-9]/.test(password);
  var symbol = /[^\w\s]/.test(password);
  return (notUsername && minLength && lowercase && uppercase && number && symbol);
}

async function register (attributes, done) {
  if (!attributes.password || attributes.password === '') {
    return done(new Error('password may not be blank'));
  }
  await dao.User.insert(_.extend(baseUser, attributes)).then(async (user) => {
    log.info('created user', user);
    (attributes.tags || attributes['tags[]'] || []).map(tag => {
      dao.UserTags.insert({ tagentity_users: tag, user_tags: user.id }).catch(err => {
        log.info('register: failed to create tag ', attributes.username, tag, err);
      });
    });
    var passport = {
      user: user.id,
      password: await bcrypt.hash(attributes.password, 10),
      accessToken: crypto.randomBytes(48).toString('base64'),
    };
    await dao.Passport.insert(_.extend(basePassport, passport)).then(passport => {
      log.info('created passport', passport);
    }).catch(err => {
      log.info('register: failed to create passport ', attributes.username, err);
    });
    return done(null, user);
  }).catch(err => {
    log.info('register: failed to create user ', attributes.username, err);
    return done(true);
  });
}

async function resetPassword (token, password, done) {
  token.deletedAt = new Date();
  var user = { id: token.userId, passwordAttempts: 0 };
  await dao.Passport.find('"user" = ?', token.userId).then(async (results) => {
    var passport = results[0] || {};
    passport.user = token.userId;
    passport.password = await bcrypt.hash(password, 10);
    passport.accessToken = crypto.randomBytes(48).toString('base64');
    // update if exist otherwise insert
    await dao.Passport.upsert(passport).then(async () => {
      await dao.User.update(user).then(async () => {
        await dao.UserPasswordReset.update(token).then(() => {
          done(null); // finished with no errors
        });
      });
    }).catch((err) => {
      log.info('reset: failed to create or update passport ', token.email, err);
      done({ message: 'Failed to reset password.' });
    });
  });
}

async function forgotPassword (username, error) {
  if (!validator.isEmail(username)) {
    return done('Please enter a valid email address.');
  }
  await dao.User.findOne('username = ?', username).then(async (user) => {
    var passwordReset = {
      userId: user.id,
      token: uuid.v4(),
      createdAt: new Date(),
      updatedAt: new Date,
    };
    await dao.UserPasswordReset.insert(passwordReset).then(() => {
      return error(false);
    }).catch((err) => {
      log.info('Error creating password reset record', err);
      return error('An error has occurred processing your request. Please reload the page and try again.');
    });
  }).catch((err) => {
    log.info('Forgot password attempt', 'No user found for email', username);
    return error(false); // Make it look like a success
  });
}

async function checkToken (token, done) {
  var expiry = new Date();
  expiry.setTime(expiry.getTime() - openopps.auth.local.tokenExpiration);
  await dao.UserPasswordReset.findOne('token = ? and "createdAt" > ?', [token, expiry]).then(async (passwordReset) => {
    await dao.User.findOne('id = ?', passwordReset.userId).then((user) => {
      return done(null, _.extend(passwordReset, { email: user.username }));
    }).catch((err) => {
      return ({ message: 'Error looking up user.', err: err }, null);
    });
  }).catch((err) => {
    return ({ message: 'Error looking up token.', err: err }, null);
  });
}

module.exports = {
  register: register,
  forgotPassword: forgotPassword,
  checkToken: checkToken,
  validatePassword: validatePassword,
  resetPassword: resetPassword,
};
