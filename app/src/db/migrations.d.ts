// drizzle-kit이 만든 migrations.js 타입 (.sql은 babel inline-import로 문자열이 된다)
declare module '*.sql' {
  const sql: string;
  export default sql;
}
