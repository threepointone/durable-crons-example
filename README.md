## Idea: Durable Crons

Every Infra Provider has "cron jobs"; the ability to run some code periodically, where you can define the period (eg: "0 22 \* \* 1-5" -> every weekday at 10pm). But they're not super granular: it's up to you to then iterate through your entire userlist/whatever and run some code elsewhere.

Durable Objects have "Alarms" a one-shot timeout that runs sometime in the future. These are nice because they run in the context of the durable object and can be custom per DO. But you can set only one at a time, and it triggers a single alarm handler.

What if we could do both?

```ts
class User extends DurableCron {
  crons = {
    sendReviewMail: "0 22 * * 1-5",
    checkUsage: "* * * * *",
  };

  sendReviewMail() {
    // send a daily report
  }

  checkUsage() {
    // check usage every minute
  }
}
```

This will run for every "User" that's instantiated, close to them, distributed across the planet. The tradeoff is that it is, well, a distributed system, so you'll also want to add o11y and admin layers into this, but it seems better overall to me.

This isn't just an idea, I got it kinda working here:

Exercise for the reader: Maybe we could use decorators to make the syntax a bit nicer?

```ts
class User extends DurableObject {
  @cron("0 22 * * 1-5")
  sendReviewMail() {
    // send a daily report
  }

  @cron("* * * * *")
  checkUsage() {
    // check usage every minute
  }
}
```

This would be better because you'd be able to extend existing Durable Objects without having to change the class definition. Maybe!
