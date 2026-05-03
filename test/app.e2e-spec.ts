import { createE2eTestApp, E2eTestApp } from './helpers/e2e-app';

describe('AppController (e2e)', () => {
  let ctx: E2eTestApp;

  beforeAll(async () => {
    ctx = await createE2eTestApp();
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('/ (GET)', () => {
    return ctx.agent.get('/i-one').expect(200).expect('Hello World!');
  });
});
