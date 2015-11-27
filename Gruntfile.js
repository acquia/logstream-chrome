module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      options: {
        browser: true, // include browser globals
        futurehostile: true, // warn if future-ES keywords are used
        globals: { // globally available variable names; value = is writable
          alert: false,
          chrome: false,
          module: true,
        },
        latedef: 'nofunc', // disallow using variables before they're defined
        nonbsp: true, // disallow non-breaking spaces
        undef: true, // warn if a variable is used without being defined
        unused: true, // warn if a variable is defined but not used
        typed: true, // support typed array globals
      },
      target: {
        src: [
          'background.js',
          'devtools.js',
          'i18n.js',
          'options.js',
          'panel.js',
          'Gruntfile.js',
        ],
      },
    },
    jscs: {
      options: {
        config: 'jscs.json',
      },
      main: [
        'background.js',
        'devtools.js',
        'i18n.js',
        'options.js',
        'panel.js',
        'Gruntfile.js',
      ],
    },
  });

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-jscs');
  grunt.registerTask('default', ['jshint', 'jscs']);
};
