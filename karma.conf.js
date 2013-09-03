// Configuration file for Karma
// http://karma-runner.github.io/0.10/config/configuration-file.html

module.exports = function(config) {
  config.set({
    frameworks: ['jasmine'],
    files: [
      'components/angular/angular.js',
      'components/angular-mocks/angular-mocks.js',
      'components/observe-js/src/observe.js',
      'lib/binder.js',
      'lib/*.js',
      'test/mock/*.js',
      'test/spec/*.js'
    ],

    autoWatch: true,
    browsers: ['Chrome']
  });
};
