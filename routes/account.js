module.exports = accountRoutes
module.exports.attributes = {
  name: 'account-routes-account'
}

var Boom = require('boom')

var errors = require('./utils/errors')
var joiFailAction = require('./utils/joi-fail-action')
var serAccount = require('./utils/serialise-account')
var serProfile = require('./utils/serialise-profile')
var toBearerToken = require('./utils/request-to-bearer-token')
var validations = require('./utils/validations')

function accountRoutes (server, options, next) {
  var serialiseAccount = serAccount.bind(null, {
    baseUrl: server.info.uri
  })
  var serialiseProfile = serProfile.bind(null, {
    baseUrl: server.info.uri
  })
  var admins = options.admins
  var sessions = server.plugins.account.api.sessions
  var accounts = server.plugins.account.api.accounts

  var signUpRoute = {
    method: 'PUT',
    path: '/session/account',
    config: {
      auth: false,
      validate: {
        headers: validations.bearerTokenHeaderForbidden,
        query: validations.accountQuery,
        payload: validations.accountPayload,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var username = request.payload.data.attributes.username
      var password = request.payload.data.attributes.password
      var id = request.payload.data.id
      var query = request.query
      accounts.add({
        username: username,
        password: password,
        include: query.include,
        id: id
      })

      .then(serialiseAccount)

      .then(function (json) {
        reply(json).code(201)
      })

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status || 400, error.message))
      })
    }
  }

  var getAccountRoute = {
    method: 'GET',
    path: '/session/account',
    config: {
      auth: false,
      validate: {
        headers: validations.bearerTokenHeader,
        query: validations.accountQuery,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var sessionId = toBearerToken(request)

      // check for admin. If not found, check for user
      admins.validateSession(sessionId)

      .then(function (doc) {
        throw errors.FORBIDDEN_ADMIN_ACCOUNT
      })

      .catch(function (error) {
        if (error.name === 'not_found') {
          return sessions.find(sessionId, {
            include: request.query.include === 'profile' ? 'account.profile' : undefined
          })
        }

        throw error
      })

      .then(function (session) {
        return session.account
      })

      .then(serialiseAccount)

      .then(reply)

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status, error.message))
      })
    }
  }

  var destroyAccountRoute = {
    method: 'DELETE',
    path: '/session/account',
    config: {
      auth: false
    },
    handler: function (request, reply) {
      var sessionId = toBearerToken(request)

      // check for admin. If not found, check for user
      admins.validateSession(sessionId)

      .then(function (doc) {
        throw errors.FORBIDDEN_ADMIN_ACCOUNT
      })

      .catch(function (error) {
        if (error.name === 'not_found') {
          return sessions.find(sessionId, {
            include: request.query.include === 'profile' ? 'account.profile' : undefined
          })
        }

        throw error
      })

      .then(function (session) {
        return accounts.remove(session.account, {
          include: request.query.include
        })
      })

      .then(function (account) {
        if (request.query.include) {
          return reply(serialiseAccount(account)).code(200)
        }

        reply().code(204)
      })

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status, error.message))
      })
    }
  }

  var getAccountProfileRoute = {
    method: 'GET',
    path: '/session/account/profile',
    config: {
      auth: false,
      validate: {
        headers: validations.bearerTokenHeader,
        failAction: joiFailAction
      }
    },
    handler: function (request, reply) {
      var sessionId = toBearerToken(request)

      // check for admin. If not found, check for user
      admins.validateSession(sessionId)

      .then(function (doc) {
        throw errors.FORBIDDEN_ADMIN_ACCOUNT
      })

      .catch(function (error) {
        if (error.name === 'not_found') {
          return sessions.find(sessionId, {
            include: 'account.profile'
          })
          .catch(function (error) {
            if (error.status === 404) {
              throw errors.NO_ACTIVE_SESSION
            }
          })
        }

        throw error
      })

      .then(function (session) {
        return session.account
      })

      .then(serialiseProfile)

      .then(reply)

      .catch(function (error) {
        error = errors.parse(error)
        reply(Boom.create(error.status, error.message))
      })
    }
  }

  server.route([
    getAccountRoute,
    signUpRoute,
    destroyAccountRoute,
    getAccountProfileRoute
  ])

  next()
}
