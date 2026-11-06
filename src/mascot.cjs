const WIDTH = 14;
function mascotFrame(cols, elapsed = 0, animated = true) {
  const travel = Math.max(0, cols - WIDTH - 6);
  const phase = ((Math.max(0, elapsed) % 16000) / 16000);
  const right = phase < .5;
  const fraction = animated ? right ? phase * 2 : 2 - phase * 2 : .5;
  const step = Math.floor(elapsed / 180) % 2;
  return {
    x: 3 + Math.round(travel * fraction),
    facing: !animated || right ? 'right' : 'left',
    lines: [
      '   ╱──────╲ ♧ ',
      '  ╱──┬─────╲  ',
      '  │ ▰    ▰ │  ',
      '  ╰───┬────╯  ',
      ' ╔╣  ◇╱   ╠╗  ',
      ' ╚╣╲____╱ ╠╝  ',
      !animated ? '   ▰╵  ╵▰     ' : step ? '   ▰╲  ╱▰     ' : '   ▰╱  ╲▰     '
    ]
  };
}
module.exports = { mascotFrame, WIDTH };
