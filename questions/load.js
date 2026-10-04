/* Parser-blocking entry: question banks must exist before course-library.js. */
if(document.readyState!=='loading')throw Error('문제 로더는 HTML의 일반 script로 불러오세요.');
for(const file of QUESTION_FILES){
  document.write('<script src="questions/'+file+'?v=20261002-manifest"><\/script>');
}
