/* Add one filename here to register a unit in every entry point. */
(function(root){
  const files=[
    'social-6-2-1.js',
    'social-6-2-2.js',
    'korean-6-2-4.js',
    'korean-6-2-3.js',
    'math-6-2-4.js',
    'math-6-2-1.js'
  ];
  if(new Set(files).size!==files.length||files.some(f=>! /^[a-z0-9]+(?:-[a-z0-9]+)*\.js$/.test(f)))throw Error('문제 파일 등록 목록을 확인하세요.');
  root.QUESTION_FILES=Object.freeze(files);
  if(typeof module!=='undefined'&&module.exports)module.exports=root.QUESTION_FILES;
})(globalThis);
