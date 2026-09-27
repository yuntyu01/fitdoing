module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // drizzle 마이그레이션 .sql 파일을 문자열로 번들에 넣는다.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
