import { DurableObject } from "cloudflare:workers";

import cronParser from "cron-parser";

export interface Env {
  User: DurableObjectNamespace<User>;
}

/**
 * Function to get the next cron job to be triggered
 */
function getNextCronJob(crons: Record<string, string>) {
  let nextTime = Infinity;
  let nextPattern = null;
  let nextTask = null;

  Object.entries(crons).forEach(([task, pattern]) => {
    try {
      const interval = cronParser.parseExpression(pattern);
      const next = interval.next();
      const nextTimestamp = next.getTime();

      if (nextTimestamp < nextTime) {
        nextTask = task;
        nextTime = nextTimestamp;
        nextPattern = pattern;
      }
    } catch (err) {
      console.error(`Invalid cron pattern: ${pattern}`);
    }
  });

  if (nextPattern === null) {
    return null;
  }

  return {
    nextTask: nextTask,
    nextPattern: nextPattern,
    nextTime: nextTime,
  };
}

// function decorateMethod(): MethodDecorator {
//   return (target, propertyKey, descriptor) => {
//     target[propertyKey] = function () {};
//   };
// }

class DurableCron extends DurableObject<Env> {
  crons: Record<string, string> = {
    // "run-monthly": "0 0 1 * *",
    // "clean-mail": "0 0 * * *",
  };
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.ctx.blockConcurrencyWhile(async () => {
      try {
        await this.setupCrons();
      } catch (e) {
        console.error("failed sto setup crons", e);
      }
    });
  }

  async setupCrons() {
    if (await this.ctx.storage.getAlarm()) {
      // this means we just woke up from hibernation
      // let's flush any set alarms if needed
      const nextTask = await this.ctx.storage.get<
        keyof typeof this.crons | null
      >("next-task");
      const nextPattern = await this.ctx.storage.get<string | null>(
        "next-pattern"
      );
      const nextTime = await this.ctx.storage.get<number | null>("next-time");
      if (nextTask && nextPattern && nextTime && nextTime < Date.now()) {
        // let's make sure there hasn't been a code update that changed the pattern
        if (this.crons[nextTask] === nextPattern) {
          console.log(
            `Running missed task: ${nextTask} with pattern: ${nextPattern}`
          );
        }
      }
      // then let's clear the alarms/storage
      // so we can set any new alarms
      await this.ctx.storage.delete("next-time");
      await this.ctx.storage.delete("next-task");
      await this.ctx.storage.delete("next-pattern");
      await this.ctx.storage.deleteAlarm();
    }

    const nextCron = getNextCronJob(this.crons);
    if (nextCron === null) {
      return;
    }
    const { nextTask, nextPattern, nextTime } = nextCron;

    console.log(`setting next task ${nextTask} at`, new Date(nextTime));
    await this.ctx.storage.setAlarm(nextTime);
    await this.ctx.storage.put("next-time", nextTime);
    await this.ctx.storage.put("next-task", nextTask);
    await this.ctx.storage.put("next-pattern", nextPattern);
  }
  async fetch(
    request: Request<unknown, CfProperties<unknown>>
  ): Promise<Response> {
    return new Response("Hello World!", { status: 200 });
  }

  // this is called when the alarm triggers
  async alarm() {
    // so let's read it from storage
    const nextTask = await this.ctx.storage.get<keyof typeof this.crons | null>(
      "next-task"
    );
    const nextPattern = await this.ctx.storage.get<string | null>(
      "next-pattern"
    );
    const nextTime = await this.ctx.storage.get<number | null>("next-time");

    // let's make sure we have the next task
    if (!nextTask || !nextPattern || !nextTime) {
      // this is odd, let's just reset the alarms
      console.log("resetting alarms");
      await this.setupCrons();
      return;
    }

    // ok so the set alarm is the next one to run, so let's do it

    // let's make sure there hasn't been a code update that changed the pattern
    if (this.crons[nextTask] === nextPattern) {
      console.log(`Running task: ${nextTask} with pattern: ${nextPattern}`);
      // @ts-expect-error eh whatever

      this[`${nextTask}` as keyof this]();
    }

    // then let's clear the alarms/storage
    await this.ctx.storage.delete("next-time");
    await this.ctx.storage.delete("next-task");
    await this.ctx.storage.delete("next-pattern");
    await this.ctx.storage.deleteAlarm();

    // ok, let's get the next task

    // let's update the alarms
    const nextCron = getNextCronJob(this.crons);
    if (nextCron === null) {
      return;
    }
    const {
      nextTask: nextTask2,
      nextPattern: nextPattern2,
      nextTime: nextTime2,
    } = nextCron;

    await this.ctx.storage.setAlarm(nextTime2);
    await this.ctx.storage.put("next-time", nextTime2);
    await this.ctx.storage.put("next-task", nextTask2);
    await this.ctx.storage.put("next-pattern", nextPattern2);

    // aight, let's ounce
  }
}

export class User extends DurableCron {
  crons = {
    checkUsage: "* * * * *",
  };

  checkUsage() {
    // ... check usage so far and do something
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const username = "jonny-alexander";
    const id = env.User.idFromName(username);
    const stub = env.User.get(id);

    return Response.json(await stub.fetch(request));
  },
};
