import baseWorker from './index.js';
import { handleEvaluationManagement } from './evaluation-management.js';

export default {
  async fetch(request, env, ctx) {
    const handled = await handleEvaluationManagement(request, env, ctx, baseWorker);
    if (handled) return handled;
    return baseWorker.fetch(request, env, ctx);
  }
};
