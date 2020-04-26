var config = {
  type: Phaser.CANVAS,
  parent: 'ninety-nine',
  width: 800,
  height: 600,
  backgroundColor: '076324',
  scene: {
    preload: preload,
    create: create
  } 
};
 
var game = new Phaser.Game(config);
var socket = null;
 
function preload() {
  this.load.atlas('cards', 'assets/cards/cards.png', 'assets/cards/cards.json', Phaser.Loader.TEXTURE_ATLAS_JSON_HASH);
  this.load.image('back', 'assets/cards/back.png');
  this.load.image('chip', 'assets/chip_red_top.png');
}
 
function create() {
  var self = this;
  this.socket = io();
  socket = this.socket;

  this.playerNames = this.add.group();
  this.playerCards = this.add.group();
  this.allPlayers = [];
  this.turn = null;
  this.currentCard = null;

  // when I connect, recieve info on current players including myself
  this.socket.on('currentPlayers', function (players) {   
    updatePlayersList(self, players)
    Object.keys(players).forEach(function (id) {
      if (!self.allPlayers.some(p => p.playerId === id)) {
        self.allPlayers.push(players[id])
      } 
    });
  });

  // a new player connects to the game
  this.socket.on('newPlayer', function (playerInfo) {
    self.allPlayers.push(playerInfo)
    updatePlayersList(self, self.allPlayers)
  });

  this.socket.on('playerUpdate', function (player) {
    var playerToUpdate = self.allPlayers.find(p => p.playerId === player.playerId);
    playerToUpdate.chips = player.chips;
  });

  // a player leaves the game
  this.socket.on('disconnect', function (playerId) {
    console.log('disconnect', playerId);
    // remove player from list
    var index = self.allPlayers.findIndex(p => p.playerId === playerId);
    self.allPlayers.splice(index, 1);
    updatePlayersList(self, self.allPlayers)
    //alert('you were disconnected. Please reload and rejoin');
  });

  // I received new cards
  this.socket.on('cardsUpdated', function(cards) {
    updateCards(self, cards);
  });

  // recieve game state update
  this.socket.on('stateUpdate', function(state) {
    // track who's turn it is
    self.turn = state.turn;
    self.graphics.clear();

    // update the played card
    if (self.currentCard === null) {
      self.currentCard = self.add.sprite(475, 200, 'cards', state.card.name);
      self.currentCard.depth = 0;
    } else {
      self.currentCard.setTexture('cards', state.card.name);
    }

    if (state.count > 99) {
      endGame(self);
    }
    
    if (state.inProgress) {
      self.deckSprite.input.enabled = false;
    } else {
      self.deckSprite.input.enabled = true;
    }
    
    // update the score counter
    self.countText.setText(state.count);

    // update who's turn it is
    if (state.inProgress) {
      updatePlayersList(self, self.allPlayers);
    }  
  });

  this.playersListText = this.add.text(16, 16, 'Players', { fontSize: '24px', fill: '#FFFFFF' });
  this.countText = this.add.text(780, 16, '0', { fontSize: '24px', fill: '#FFFFFF' });
  this.countText.setOrigin(1, 0);
  this.graphics = self.add.graphics(100, 100);
  this.deckSprite = this.add.sprite(325, 200, 'back').setInteractive();
  this.deckSprite.setScale(0.25);

  this.deckSprite.on('pointerdown', function() {
      deal();
  });
}

function endGame(self) {
  // draw red X
  self.graphics.lineStyle(10, 0xFF0000, 1);
  self.graphics.depth = 1;

  self.graphics.beginPath();
  self.graphics.moveTo(400, 150);
  self.graphics.lineTo(550, 250);
  self.graphics.closePath();
  self.graphics.strokePath();

  self.graphics.beginPath();
  self.graphics.moveTo(550, 150);
  self.graphics.lineTo(400, 250);
  self.graphics.closePath();
  self.graphics.strokePath();
}
 
function updateCards(self, cards) {
  self.playerCards.getChildren().map(child => child.destroy());
  self.playerCards.clear(true, true);
  var offset = 265;
  cards.forEach(card => {
    var cardSprite = self.add.sprite(offset, 450, 'cards', card.name);
    offset += cardSprite.width + 10;
    cardSprite.setInteractive();
    cardSprite.on('pointerdown', function() {
      self.socket.emit('cardPlayed', card);
    })
    self.playerCards.add(cardSprite);
  });
}


function updatePlayersList(self, players) {
  self.playerNames.clear(true, true);
  verticalOffset = 52;
  Object.keys(players).forEach(function (id) {    
    var player = players[id];
    // make player group and clear it
    var text = self.add.text(16, verticalOffset, player.name,
       { fontSize: '16px', fill: self.turn === player.playerId ? '#FFFF00': '#FFFFFF' }
    );

    const buffer = 20;
    for (let i = 0; i < player.chips; i++) {
      var chip = self.add.sprite(16 + (text.width + buffer*(i+1)), verticalOffset, 'chip');
      chip.setOrigin(0, 0);
      chip.setScale(0.5);
      self.playerNames.add(chip);
    }

    self.playerNames.add(text);
    verticalOffset += 24;
  })
}

function startRound(name) {
  socket.emit('startRound', name);
}

function deal() {
  socket.emit('deal');
}

function handleNameEntry() {
  var name = document.getElementById('nameField').value;
  var chips = document.getElementById('chipsField').value;
  if (!chips) {
    chips = 4
  };
  socket.emit('nameEntered', name, chips > 4 ? 4 : chips);
  var nameForm = document.getElementById('name-form');
  nameForm.parentElement.removeChild(nameForm);
}

function handleObserve() {
  var nameForm = document.getElementById('name-form');
  nameForm.parentElement.removeChild(nameForm);
}