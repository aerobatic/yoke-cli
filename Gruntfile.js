/*jshint strict:false */
module.exports = function( grunt ) {

  grunt.initConfig({

    jshint: {
      options: {
        jshintrc : ".jshintrc"
      },
      files: [ "commands/**/*.js", "test/**/*.js" ]
    },

    mochaTest: {
      options: {
        // ui: "bdd",
        // reporter: "spec",
        require: "test/before.js"
      },
      all: "test/commands/*.js"
    }

  });

  grunt.loadNpmTasks("grunt-contrib-jshint");
  grunt.loadNpmTasks("grunt-mocha-test");
  grunt.loadNpmTasks("grunt-release");

  grunt.registerTask("default", [ "jshint", "mochaTest" ]);

};