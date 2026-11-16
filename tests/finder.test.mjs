import test from "node:test";
import assert from "node:assert/strict";
import { parseRobots, scoreEmail } from "../lib/finder.js";

test("robots.txt rules for * are followed, longest match wins", () => {
  const ok = parseRobots("User-agent: *\nDisallow: /alumni\nAllow: /alumni/contact\n\nUser-agent: OtherBot\nDisallow: /");
  assert.equal(ok("/contact"), true);
  assert.equal(ok("/alumni"), false);
  assert.equal(ok("/alumni/contact"), true);
});

test("a Disallow: / for everyone blocks every page", () => {
  assert.equal(parseRobots("User-agent: *\nDisallow: /")("/contact"), false);
});

test("good addresses outrank bad ones, and bad ones are dropped", () => {
  assert.equal(scoreEmail("privacy@cmu.edu", "cmu.edu"), -1);
  assert.ok(scoreEmail("admissions@cmu.edu", "cmu.edu") > scoreEmail("someone@gmail.com", "cmu.edu"));
});
