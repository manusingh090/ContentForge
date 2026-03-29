/**
 * ContentForge — SVG icon helper (uses sprite symbols in index.html)
 */
(function () {
  window.cfIcon = function cfIcon(name, extraClass) {
    var cls = 'icon' + (extraClass ? ' ' + extraClass : '');
    return (
      '<svg class="' +
      cls +
      '" aria-hidden="true" focusable="false">' +
      '<use href="#icon-' +
      name +
      '"/></svg>'
    );
  };
})();
