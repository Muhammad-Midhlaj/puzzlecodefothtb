/**
 * Copyright 2013 Michael N. Gagnon
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var BotColor = {
  NUM_COLORS: 2,
  BLUE: 0,
  RED: 1
}

function executeTurn(result, bot, direction) {
  assert(direction == Direction.LEFT || direction == Direction.RIGHT,
    "executeTurn: direction == Direction.LEFT || direction == Direction.RIGHT")
  bot.facing = rotateDirection(bot.facing, direction)
  result.visualize.rotate = true
}

function executeGoto(result, bot, nextIp) {
  bot.ip = nextIp
  result.visualize.goto = true
}

// a bot tries to move into cell x,y.
// returns true if the bot is allowed to move in, false otherwise
// TODO: also check for bots
function tryMove(board, bot, x, y) {
  var matchingBlocks = _(board.blocks)
    .filter( function(block) {
      return block.x == x && block.y == y
    })
    .value()

  return matchingBlocks.length == 0
}

/**
 * executes the 'move' instruciton on the bot
 * updates the bot and board state
 * When a bot moves, it deposits two markers:
 *  - at the head in the old cell
 *  - at the tail in the new cell
 */
function executeMove(result, board, bot) {

  var prevX = bot.cellX
  var prevY = bot.cellY

  var dx = 0
  var dy = 0
  if (bot.facing == Direction.UP) {
    dy = -1
  } else if (bot.facing == Direction.DOWN) {
    dy = 1
  } else if (bot.facing == Direction.LEFT) {
    dx = -1
  } else if (bot.facing == Direction.RIGHT) {
    dx = 1
  } else {
    console.error("this code shoudln't be reachable: executeMove")
  }

  xResult = wrapAdd(bot.cellX, dx, board.num_cols)
  yResult = wrapAdd(bot.cellY, dy, board.num_rows)
  destX = xResult[0]
  destY = yResult[0]
  xTorus = xResult[1]
  yTorus = yResult[1]

  if (!tryMove(board, bot, destX, destY)) {
    result.visualize.failMove = {
      destX: bot.cellX + dx,
      destY: bot.cellY + dy
    }
  } else {
    // TODO: break this function up into smaller functions
    
    result.depositMarker.push({
      x: bot.cellX,
      y: bot.cellY,
      quadrant: bot.facing,
      botColor: bot.botColor
    })

    bot.cellX = destX
    bot.cellY = destY
    
    // did the bot pickup a coin?
    var matchingCoins = _(board.coins)
      .filter( function(coin) {
        return coin.x == bot.cellX && coin.y == bot.cellY
      })
      .value()

    assert(matchingCoins.length == 0 || matchingCoins.length == 1,
      "matchingCoins.length == 0 || matchingCoins.length == 1")

    if (matchingCoins.length == 1) {
      var matchingCoin = matchingCoins[0]

      // remove the coin from the board
      board.coins = _(board.coins)
        .filter( function(coin) {
          return !(coin.x == bot.cellX && coin.y == bot.cellY)
        })
        .value()

      board.coinsCollected += 1

      result.visualize.coin_collect = matchingCoin
    }

    if (xTorus != "torus" && yTorus != "torus") {
      result.visualize.nonTorusMove = true
    } else {
      result.visualize.torusMove = {
        prevX: prevX,
        prevY: prevY,
        oobPrevX: bot.cellX - dx,
        oobPrevY: bot.cellY - dy,
        oobNextX: prevX + dx, 
        oobNextY: prevY + dy
      }
    }

    result.depositMarker.push({
      x: bot.cellX,
      y: bot.cellY,
      quadrant: oppositeDirection(bot.facing),
      botColor: bot.botColor
    })

  }
}

// assumes relatively sane values for increment
// returns [value, moveType]
// where moveType == "moveTorus" or "moveNonTorus"
function wrapAdd(value, increment, outOfBounds) {
  value += increment
  if (value >= outOfBounds) {
    return [value % outOfBounds, "torus"]
  } else if (value < 0) {
    return [outOfBounds + value, "torus"]
  } else {
    return [value, "nonTorus"]
  }
}

function decayMarker(strength) {
  strength = strength - 0.01
  if (strength <= MIN_MARKER_STRENGTH) {
    // TODO: should this function return undefined instead?
    return MIN_MARKER_STRENGTH
  } else {
    return strength
  }
}

/**
 * marker has following fields: x, y, quadrant, botColor
 */
function addMarker(board, marker) {
  var currentStrength = board.markers[marker.x][marker.y][marker.quadrant][marker.botColor]
  if (typeof currentStrength === 'undefined') {
    currentStrength = 0.0
  }

  currentStrength += INIT_MARKER_STRENGTH
  if (currentStrength >= MAX_MARKER_STRENGTH) {
    currentStrength = MAX_MARKER_STRENGTH
  }

  board.markers[marker.x][marker.y][marker.quadrant][marker.botColor] =
    currentStrength
}

/**
 * Returns a list of marker objects, for markers with defined strength
 * each marker has following fields: x, y, quadrant, botColor, strength
 *
 * set keepUndefined to true to emit every marker, regardless of definition
 */
function getMarkers(board, keepUndefined) {

  if (typeof keepUndefined === 'undefined') {
    keepUndefined = false
  }
  var markers = []
  for (var x = 0; x < board.num_cols; x++) {
    for (var y = 0; y < board.num_rows; y++) {
      for (var q = 0; q < Direction.NUM_DIRECTIONS; q++) {
        for (var c = 0; c < BotColor.NUM_COLORS; c++) {
          strength = board.markers[x][y][q][c]
          if (!keepUndefined && typeof strength === 'undefined') {
            continue
          }
          marker = {
            x: x,
            y: y,
            quadrant: q,
            botColor: c,
            strength: strength
          }
          markers.push(marker)
        }
      }
    }
  }
  return markers
}

// called upon a victory
// Updates state.visibility
// TODO: this code muddles view and model.
// TODO: reimplement all the visualization stuff in the visualization section
// of code. Have it compare the previous game state with the new game state. 
function updateLevelVisibility(board, campaign, state) {
  console.error("updateLevelVisibility not implemented")
}

/*function updateLevelVisibility(board, campaign, state) {

  var world_index = state.current_level.world_index
  var level_index = state.current_level.level_index
  var on_victory = campaign[world_index].levels[level_index].on_victory
  assert(on_victory.length > 0, "setupVictoryModal: on_victory.length > 0")

  // if this level has been beaten for the first time
  if (!state.visibility[world_index][level_index]) {
    state.visibility[world_index][level_index] = true
    board.visualize.step.general.checkOffLevel = {
      world_index: world_index,
      level_index: level_index
    }

    // if this world has been beaten for the first time
    var numLevelsInWorld = campaign[world_index].levels.length
    // TODO: make it so that you can mark a world as completed in state.visibility
    if (level_index == numLevelsInWorld - 1) {
      board.visualize.step.general.checkOffWorld = {
        world_index: world_index
      }
    }
  }

  var animationAddLevel = []
  var animationAddWorld = []

  for (var i = 0; i < on_victory.length; i++) {
    var victoryEvent = on_victory[i]
    if (victoryEvent.type == OnVictory.UNLOCK_NEXT_LEVEL) {
      var next_level_index = parseInt(level_index + 1)  
      // if the level isn't already accessible
      if (!(next_level_index in state.visibility[world_index])) {
        state.visibility[world_index][next_level_index] = false
        animationAddLevel.push({
          world_index: world_index,
          level_index: next_level_index
        })
      }
    } else if (victoryEvent.type == OnVictory.UNLOCK_NEXT_WORLD) {
      var next_world_index = parseInt(world_index + 1)  
      if (!(next_world_index in state.visibility)) {
        state.visibility[next_world_index] = {}
        state.visibility[next_world_index][0] = false

        animationAddWorld.push(next_world_index)
        animationAddLevel.push({
          world_index: next_world_index,
          level_index: 0
        })
      }
    } else {
      console.error("unknown victoryEvent.type == " + victoryEvent.type)
    }
  }

  if (animationAddWorld.length > 0) {
    board.visualize.step.general.addWorld = animationAddWorld
  }

  if (animationAddLevel.length > 0) {
    board.visualize.step.general.addLevel = animationAddLevel
  }

}*/

function checkVictory(board, campaign, state) {
  if (board.victory) {
    return
  }

  var win_conditions = board.win_conditions
  var conditionsMet = 0

  for (var i = 0; i < win_conditions.length; i++) {
    var condition = win_conditions[i]
    if (condition.type == WinCondition.COLLECT_COINS) {
      if (board.coins.length == 0) {
        conditionsMet += 1
      }
    } else {
      console.error("Unsupported condition.type " + condition.type)
    }
  }

  if (win_conditions.length == conditionsMet) {
    board.victory = true
    board.visualize.step.general.victory = true
    updateLevelVisibility(board, campaign, state)
  }
}

// TODO: do a better job separating model from view.
function step(board, campaign, state) {

  // TODO: assertLazy that all bot ids are unique

  // contains all data needed to visualize this step of the game
  board.visualize.step = {

    // visualizations associated with the board, but not any particular bot
    general: {},

    // bots[bot.id] == an object containing all visualizations for that bot
    // e.g. bot[1].lineIndex == the index of the line currently being
    // executed for that bot with bot.id == 1
    bot: {}
  }

  _(board.bots).forOwn(function(bot) {

    // make sure this bot hasn't finished
    if ("done" in bot.program) {
      return
    } 

    var instruction = bot.program.instructions[bot.ip]

    // NOTE: executing the instruction may modify the ip
    bot.ip = bot.ip + 1

    // the bot-instruction functions will populate the fields of result
    var result = {
      // containins all visualizations for this bot
      visualize: {},
      // array of markers deposited by the bot
      depositMarker: []
    }

    if (instruction.opcode == Opcode.MOVE) {
      executeMove(result, board, bot)
    } else if (instruction.opcode == Opcode.TURN) {
      executeTurn(result, bot, instruction.data)
    } else if (instruction.opcode == Opcode.GOTO) {
      executeGoto(result, bot, instruction.data)
    }

    board.visualize.step.bot[bot.id] = result.visualize
    board.visualize.step.bot[bot.id].lineIndex = instruction.lineIndex

    // if the bot has reached the end of its program
    if (bot.ip >= bot.program.instructions.length) {
      bot.program.done = true
      board.visualize.step.bot[bot.id].programDone = true
    }

    _(result.depositMarker).forEach( function (marker) {
      addMarker(board, marker)
    })

  })

  checkVictory(board, campaign, state)

  // Decay the strength of each marker on the board
  _(getMarkers(board)).forEach( function(m) {
    board.markers[m.x][m.y][m.quadrant][m.botColor] = decayMarker(m.strength)
  })
}

