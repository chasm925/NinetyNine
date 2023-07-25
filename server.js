import express  from 'express';
import { Server } from 'socket.io';
import http from 'http';

const app = express();
const server = http.Server(app);
const io = new Server(server);

const players = {};
const playerCards = {}
let deck = [];
let discard = [];

let state = {
  turn: null,
  card: null,
  count: 0,
  isReversed: false,
  inProgress: false
}

app.use('/', express.static('public',  { index: 'index.html' }));

io.on('connection', function (socket) {
  console.log('a user connected');

  // send the players object to the new player
  socket.emit('currentPlayers', players);

  // when a player disconnects, remove them from our players object
  socket.on('disconnect', function () {
    console.log('user disconnected');

    // if player hasn't joined yet, nothing to do
    if (!(socket.id in players)) return;

    console.log('player left:', players[socket.id].name);
    console.log(new Date().toTimeString());

    // add player's cards to the discard pile
    playerCards[socket.id].forEach(card => {
      discard.push(card);
    });

    // if it's this player's turn, update to next player
    if (state.turn === socket.id) {
      state.turn = getNextTurn();
    }

    // remove this player from our players object
    delete players[socket.id];
    delete playerCards[socket.id];

    // last player leaves, end the game
    if (Object.keys(players).length === 0) {
      endGame();
    }

    // emit a message to all players to remove this player
    io.emit('disconnected', socket.id);

    // also update state so turn is updated
    io.emit('stateUpdate', state);
  });

  socket.on('nameEntered', function(name, chips) {
      console.log('player joined:', name);
      console.log(new Date().toTimeString());

      // create a new player and add it to our players object
      players[socket.id] = {
        playerId: socket.id,
        name: name,
        chips: chips
      };

      // keep track of player cards privately in a different list
      playerCards[socket.id] = [];

      // if the game is in progress, draw them in
      if (state.inProgress) {
        playerCards[socket.id] = drawThree();
        socket.emit('cardsUpdated', playerCards[socket.id]);
        socket.emit('stateUpdate', state);
      }
    
      // send the players object to the new player
      socket.emit('currentPlayers', players);

      // update all other players of the new player
      socket.broadcast.emit('newPlayer', players[socket.id]);
  })

  socket.on('deal', function() {
    if (Object.keys(players).length === 0 ||
        state.inProgress ||
        !(socket.id in players)
      ) {
      return;
    }

    startRound(io, socket.id);
  })

  socket.on('startRound', function(name) {
    if (Object.keys(players).length === 0) return;

    let turn = null;

    // round starts with first player unless specified
    if (Object.values(players).some(p => p.name === name)) {
      turn = Object.values(players).find(p => p.name === name).playerId;
    } else {
      turn = Object.values(players)[0].playerId;
    }

    startRound(io, turn);
  });

  socket.on('cardPlayed', function (card) {
    // if it's not this player's turn or game is over, do nothing
    if (!state.inProgress || state.turn !== socket.id) {
      return;
    }

    state.card = card;
    state.count = getCount(card, state.count);
    if (card.name.startsWith('2_of_')) {
      state.isReversed = !state.isReversed;
    }
    state.turn = getNextTurn();
    
    // end the game if we go over 99
    if (state.count > 99) {
      players[socket.id].chips -= 1;
      state.inProgress = false;
      io.emit('playerUpdate', players[socket.id]);
    }

    // draw next card before discard in case of reshuffle
    const drawed = draw();

    // find played card in player's hand and discard
    const currentCards = playerCards[socket.id];
    var cardIndex = currentCards.findIndex(c => c.name === card.name);
    discard.push(currentCards.splice(cardIndex, 1)[0]);

    // small chance of not re-drawing
    var random = Math.floor(Math.random() * 100);
    if (random !== 13 || currentCards.length < 2) {
      // draw a new card and update
      currentCards.splice(cardIndex, 0, drawed);
    }
    
    socket.emit('cardsUpdated', currentCards);

    // update the state and broadcast
    io.emit('stateUpdate', state);
  });
});

function startRound(io, turn) {
  initializeDeck();

  // send 3 cards to each player
  Object.keys(players).forEach(key => {
    // send cards privately to each client
    playerCards[key] = drawThree();
    io.to(key).emit('cardsUpdated', playerCards[key]);
  });

  const drawed = draw();
  discard.push(drawed);

  // update state
  state.turn = turn;
  state.card =drawed;
  state.count = getCount(state.card, 0);
  state.isReversed = state.card.name.startsWith('2_of_') ? true : false;
  state.inProgress = true

  // broadcast state change to all players
  io.emit('stateUpdate', state);

  console.log('Deck created', deck.length)
}

function drawThree() {
  const cards = [];
  for (let index = 0; index < 3; index++) {
    cards.push(draw());
  }
  return cards;
}

function draw() {
  if (deck.length === 0) {
    // swap deck with discard and reshuffle
    console.log('Reshuffling deck')
    deck = discard.slice();
    discard = [];
    shuffle(deck);
  }
  return deck.shift();
}

function getNextTurn() {
    var currentPlayerIndex = Object.keys(players).indexOf(state.turn);
    if (state.isReversed) {
      if (currentPlayerIndex === 0) {
        return Object.values(players)[Object.values(players).length - 1].playerId;
      } else {
        return Object.values(players)[currentPlayerIndex - 1].playerId;
      }
    } else {
      if (currentPlayerIndex + 1 >= Object.keys(players).length) {
        return Object.values(players)[0].playerId;
      } else {
        return Object.values(players)[currentPlayerIndex + 1].playerId;
      }
    }
}

function getCount(card, currentTotal) {
  // special case for ace. handle optimally for now
  if (card.name.startsWith('ace_of_')) {
    if (currentTotal + 11 <= 99) {
      return currentTotal + 11;
    }
    return currentTotal + 1;
  }
  if (card.value === 9) {
    return 99;
  }
  return card.value + currentTotal;
}

function endGame() {
  deck = [];
  discard = [];

  state = {
    turn: null,
    card: null,
    count: 0,
    isReversed: false,
    inProgress: false
  }
}

function initializeDeck() {
  deck = createDeck()
  shuffle(deck)
  discard = []
}

function createDeck() {
  var cards = [];
  var faces = ['king', 'queen', 'jack', 'ace'];
  var suits = ['clubs', 'hearts', 'spades', 'diamonds'];

  for (let index = 2; index <= 10; index++) {
    var cardValue = null;
    if (index === 10) {
      cardValue = -10;
    } else if (index === 2) {
      cardValue = 0; 
    } else {
      cardValue = index
    }
    suits.forEach(suit => {
      cards.push({
        name: index + '_of_' + suit,
        value: cardValue,
        face: null
      })
    });
  }

  faces.forEach(face => {
    suits.forEach(suit => {
      cards.push({
        name: face + '_of_' + suit,
        value: getFaceValue(face),
        face: face
      })
    });
  });

  return cards
}

function getFaceValue(face) {
  const faceValues = {
    "queen": 10,
    'king': 10,
    'jack': 0,
    'ace': 11
  }
  return faceValues[face]
}

/*
* Fisher-Yates shuffle
*/
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

server.listen(process.env.PORT || 3000, function () {
  console.log(`Listening on ${server.address().port}`);
});