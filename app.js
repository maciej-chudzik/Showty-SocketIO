var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http, { cookie: false });
const Sequelize = require('sequelize');
//var socketioJwt = require('socketio-jwt');
var moment = require('moment');

var connectedSocketsList = [];

function getConnectedList()
{
    let list = []

    for (let [id, socket] of io.of("/").sockets) {


        list.push(socket.handshake.query.login);
    }

    return list
};


const sequelize = new Sequelize(process.env.DATABASE_NAME, process.env.USER, process.env.PASSWORD,{
    host: process.env.DATABASE_URL,
    dialect: 'postgres',
    protocol: "postgres",
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }

    },
    define:{
        timestamps: false

    }
});

sequelize
    .authenticate()
    .then(() => {
        console.log('Connection has been established successfully.');
    })
    .catch(err => {
        console.error('Unable to connect to the database:', err);
    });


const Messages = sequelize.define('messages', {

    receiver: {
        type: Sequelize.STRING(80),
        allowNull: false
    },
    sender: {
        type: Sequelize.STRING(80),
        allowNull: false
    },
    text: {
        type: Sequelize.STRING(640),
        allowNull: true
    },
    sentAt: {
        type: Sequelize.STRING(80),
        allowNull: false
    },
    read: {
        type: Sequelize.BOOLEAN,
        allowNull: false
    },
    url: {
        type: Sequelize.STRING(200),
        allowNull: true
    },
}, {

});


app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
  });


http.listen(process.env.PORT || 3000, function(){
  console.log("Express server listening on port %d in %s mode", this.address().port, app.settings.env);
});



// io.use(socketioJwt.authorize({
//     secret: process.env.JWT_SECRECT_KEY,
//     auth_header_required: true,
//     handshake: true,
// }));

io.on('connection', function(clientSocket) {


    const login_connected = clientSocket.handshake.query.login;
    const connect_message = "User " + login_connected + " connected.";
    console.log(connect_message);
    console.log(clientSocket.handshake)

    var userInfo = {};
    var foundSpecificSocket = false;

    for (var i = 0; i < connectedSocketsList.length; i++) {
        if (connectedSocketsList[i]["login_connected"] == login_connected && connectedSocketsList[i]["socket_connected"] == clientSocket) {
            foundSpecificSocket = true;
            break;
        }
    }

    if (!foundSpecificSocket) {
        userInfo["socket_connected"] = clientSocket;
        userInfo["login_connected"] = login_connected;
        connectedSocketsList.push(userInfo);
        console.log(connectedSocketsList);
        console.log(getConnectedList());
    }

    clientSocket.on('connectedUsersUpdate', function () {

        io.emit("connectedUsers", getConnectedList())

    });

    clientSocket.on('disconnect', function () {

       io.emit("connectedUsers", getConnectedList())

        const disconnect_message = "User " + login_connected + " disconnected.";
        console.log(disconnect_message);

        for (var i = 0; i < connectedSocketsList.length; i++) {
            if (connectedSocketsList[i]["socket_connected"] == clientSocket) {


                connectedSocketsList.splice(i, 1)
                console.log(connectedSocketsList)
                console.log(getConnectedList())

                break;
            }
        }

    });

    clientSocket.on('error', function(error){
        console.log(error)

    });

    clientSocket.on("chatMessage", function (sender, receiver, message, url, msgSavedCallback) {

        console.log("message received from " + sender + " to " + receiver)

        var sentAt = moment().format('YYYY-MM-DD HH:mm:ss.SSSSSS').toLocaleString();

        Messages.sync().then(() => {

            return Messages.create({
                receiver: receiver,
                sender: sender,
                text: message,
                sentAt: sentAt,
                read: false,
                url: url
            }).then(function (msgSaved) {

                if (msgSaved) {

                    msgSavedCallback(JSON.stringify(msgSaved))

                    for (var i = 0; i < connectedSocketsList.length; i++) {
                        if (connectedSocketsList[i]["login_connected"] == receiver) {

                            connectedSocketsList[i]["socket_connected"].emit('newChatMessage', msgSaved.sender, msgSaved.text, msgSaved.sentAt, msgSaved.id, msgSaved.read, msgSaved.receiver, msgSaved.url,(msgReceived) => {

                                if (Boolean(msgReceived)) {

                                    console.log("message received by client")
                                }

                            });
                            break;
                        }
                    }
                } else {

                    msgSavedCallback(null)

                }


            });
        });

    });

    clientSocket.on("updateReadStatus", function (msgID, msgUpdateCallback) {

        console.log("updateReadStatus" + msgID);



        Messages.findByPk(msgID).then(function (message) {

            if (message) {
                message.update({
                    read: true
                }).then(function () {

                    console.log(Boolean(true));

                    msgUpdateCallback(Boolean(true))

                    for (var i = 0; i < connectedSocketsList.length; i++) {
                        if (connectedSocketsList[i]["login_connected"] == message.sender) {

                            connectedSocketsList[i]["socket_connected"].emit('messageRead', message.id)

                        }
                    }
                })

            } else {

                msgUpdateCallback(Boolean(false))
                console.log(Boolean(false));

            }

        })


    });


    clientSocket.on("startedTyping", function (receiver) {

        console.log("User " + login_connected + " is writing a message...");
        for (var i = 0; i < connectedSocketsList.length; i++) {
            if (connectedSocketsList[i]["login_connected"] == receiver) {

                connectedSocketsList[i]["socket_connected"].emit('userStartedTyping')
            }
        }
    });


    clientSocket.on("stoppedTyping", function (receiver) {

        console.log("User " + login_connected + " stopped writing a message...");
        for (var i = 0; i < connectedSocketsList.length; i++) {
            if (connectedSocketsList[i]["login_connected"] == receiver) {

                connectedSocketsList[i]["socket_connected"].emit('userStoppedTyping')
            }
        }
    });
})

