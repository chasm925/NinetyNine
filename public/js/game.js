const config = {
  type: Phaser.WEBGL,
  parent: 'ninety-nine',
  // backgroundColor: '076324',
  transparent: true,
  scene: {
    preload: preload,
    create: create
  },
  width: 1200,
  height: 800,
  scale: {
    autoCenter: Phaser.Scale.CENTER_BOTH,
    mode: Phaser.Scale.FIT,
    maxWidth: 1200,
    maxHeight: 800
  }
};
 
const game = new Phaser.Game(config);
let socket = null;
 
function preload() {
  const backgroundGraphics = this.add.graphics(0, 0);
  backgroundGraphics.setDepth(-10);
  backgroundGraphics.fillGradientStyle(0x043313, 0x076324, 0x043313, 0x076324);
  backgroundGraphics.fillRect(0, 0, this.game.scale.width, this.game.scale.height);

  this.load.atlas('cards', 'assets/cards/cards.png', 'assets/cards/cards.json', Phaser.Loader.TEXTURE_ATLAS_JSON_HASH);
  this.load.image('back', 'assets/cards/back.png');
  this.load.image('chip', 'assets/chip_red_top.png');
}
 
function create() {
  const self = this;
  this.socket = io();
  socket = this.socket;

  // globals
  this.allPlayers = [];
  this.turn = null;
  this.currentCard = null;

  // register events
  this.socket.on('currentPlayers', (players) => handleCurrentPlayersUpdate(self, players));
  this.socket.on('newPlayer', (playerInfo) => handleNewPlayer(self, playerInfo));
  this.socket.on('playerUpdate', (player) => handlePlayerUpdate(self, player));
  this.socket.on('disconnected', (playerId) => handlePlayerDisconnected(self, playerId));
  this.socket.on('cardsUpdated', (cards) => updateCards(self, cards));
  this.socket.on('stateUpdate', (state) => handleStateUpdate(self, state));
  
  // create initial game objects
  const centerX = self.game.scale.width / 2;
  const centerY = self.game.scale.height / 2;

  const infoSize = self.game.scale.width * 0.25;
  const playAreaSize = self.game.scale.width * 0.75;

  // containers
  this.playerNames = this.add.container();
  this.playerCardsContainer = this.add.container();
  this.playerCardsContainer.setX(infoSize + (playAreaSize / 2));
  this.playerCardsContainer.setY(centerY + 150);

  // the deck play area
  this.deckPlayContainer = this.add.container();
  this.deckPlayContainer.setX(infoSize + (playAreaSize / 2));
  this.deckPlayContainer.setY(centerY - 150);

  this.playersListText = this.add.text(16, 16, 'Players', { fontSize: '28px', fill: '#FFFFFF' });

  this.countText = this.add.text(200, 0, '0', { fontSize: '112px', fill: '#FFFFFF' });
  this.countText.setOrigin(0.5, 0.5);
  this.deckPlayContainer.add(this.countText);

  this.redXGraphics = self.add.graphics(100, 100);
  this.deckPlayContainer.add(this.redXGraphics);

  drawPlayersContainer(self);

  this.deckSprite = this.add.sprite(-200, 0, 'back').setInteractive();
  this.deckSprite.setScale(0.318);
  this.deckSprite.on('pointerdown', () => deal());
  this.deckPlayContainer.add(this.deckSprite);

  this.scale.startFullscreen();
}

/*
* when I connect, recieve info on current players including myself
*/
function handleCurrentPlayersUpdate(self, players) {
  updatePlayersList(self, players)
  Object.keys(players).forEach(function (id) {
    if (!self.allPlayers.some(p => p.playerId === id)) {
      self.allPlayers.push(players[id])
    } 
  });
}

function handleNewPlayer(self, playerInfo) {
  self.allPlayers.push(playerInfo)
  updatePlayersList(self, self.allPlayers)
}

function handlePlayerUpdate(self, player) {
  const playerToUpdate = self.allPlayers.find(p => p.playerId === player.playerId);
  playerToUpdate.chips = player.chips;
}

function handlePlayerDisconnected(self, playerId) {
  // remove player from list
  var index = self.allPlayers.findIndex(p => p.playerId === playerId);
  self.allPlayers.splice(index, 1);
  updatePlayersList(self, self.allPlayers)
}

function handleStateUpdate(self, state) {
  const centerX = self.game.scale.width / 2;
  const centerY = self.game.scale.height / 2;

  // track who's turn it is
  self.turn = state.turn;
  self.redXGraphics.clear();

  // update the played card
  if (self.currentCard === null) {
    self.currentCard = self.add.sprite(0, 0, 'cards', state.card.name);
    self.currentCard.setScale(1.25);
    self.deckPlayContainer.add(self.currentCard);
    self.deckPlayContainer.sendToBack(self.currentCard);
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
}

function drawPlayersContainer(self) {
  const width = self.game.scale.width / 4;
  const height = self.game.scale.height;

  self.playersGraphics = self.add.graphics();
  self.playersGraphics.setDepth(-1);
  self.playersGraphics.fillStyle(0x000000, 0.30);
  self.playersGraphics.fillRoundedRect(0, 0, width, height, 5);
}

function endGame(self) {
  // draw red X
  self.redXGraphics.lineStyle(10, 0xFF0000, 1);
  self.redXGraphics.beginPath();
  self.redXGraphics.moveTo(-75, -75);
  self.redXGraphics.lineTo(75, 75);
  self.redXGraphics.closePath();
  self.redXGraphics.strokePath();

  self.redXGraphics.beginPath();
  self.redXGraphics.moveTo(-75, 75);
  self.redXGraphics.lineTo(75, -75);
  self.redXGraphics.closePath();
  self.redXGraphics.strokePath();
}
 
function updateCards(self, cards) {
  self.playerCardsContainer.removeAll(true);

  const spacing = 200;
  let offset = -spacing;

  cards.forEach(card => {
    const cardSprite = self.add.sprite(offset, 0, 'cards', card.name);
    offset += spacing;
    cardSprite.setInteractive();
    cardSprite.on('pointerdown', () => {
      self.socket.emit('cardPlayed', card);
    })
    cardSprite.setScale(1.25);
    self.playerCardsContainer.add(cardSprite);
  });
}


function updatePlayersList(self, players) {
  self.playerNames.removeAll(true);
  let verticalOffset = 52;
  Object.keys(players).forEach((id) => {    
    var player = players[id];
    // make player group and clear it
    var text = self.add.text(16, verticalOffset, player.name,
       { fontSize: '24px', fill: self.turn === player.playerId ? '#FFFF00': '#FFFFFF' }
    );

    const buffer = 24;
    for (let i = 0; i < player.chips; i++) {
      // var chip = self.add.sprite(12 + (text.width + buffer*(i+1)), verticalOffset, 'chip');
      var chip = self.add.sprite((140 - 20) + (buffer*(i+1)), verticalOffset, 'chip');
      chip.setOrigin(0, 0);
      chip.setScale(0.65);
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