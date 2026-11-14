# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-feature.spec.ts >> Auralis - Full Feature Tests >> Authentication & House >> can sign up and create a house
- Location: e2e\full-feature.spec.ts:10:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#side')
Expected: visible
Received: hidden
Timeout:  15000ms

Call log:
  - Expect "toBeVisible" locator('#side') with timeout 15000ms
  - waiting for locator('#side')
    33 × locator resolved to <aside id="side">…</aside>
       - unexpected value "hidden"

```

```yaml
- heading "Auralis" [level=1]: A u r a l i s
- paragraph:
  - text: Study with your friends in a tiny pixel house.
  - mark: Focus
  - text: together,
  - mark: earn
  - text: coins,
  - mark: decorate
  - text: everything.
- img "Friends studying together in a cozy pixel room with a cat, a bunny and a baby dragon"
- text: chapter 3 ✔ study buddy bonus! new sofa!!
- paragraph: psst… tap the room ✨
- region "How it works": 1. Focus Pick a subject, start a timer. Your buddy sits down at their desk. 2. Earn Every focused minute is a coin. Study with a friend for +25%. 3. Decorate Furnish your room, make it bigger, adopt a pet you really earned.
- region "Build your buddy":
  - heading "Build your buddy" [level=2]
  - img "Your character preview"
  - paragraph: buns · sweater · happy
  - button "🎲 Shuffle"
  - paragraph: Sign up and this buddy is yours. You can change it any time.
- text: free & cozy
- heading "Move into the house 🏠" [level=2]
- button "Sign up"
- button "Log in"
- text: Username
- textbox "Username": TestUser1794676193912
- text: Email
- textbox "Email": test1794676193762@example.com
- text: Password
- textbox "Password": password123
- text: Confirm password
- textbox "Confirm password": password123
- alert: Usernames can have at most 20 characters (that one has 21).
- button "Create my room"
- paragraph: Already studying with us? Switch to Log in.
- paragraph:
  - link "Privacy policy":
    - /url: /privacy.html
- list:
  - listitem: Rooms that join up Share a code and your rooms open into one big house, each with its own look.
  - listitem: To-dos & chat A shared list for the whole house, and speech bubbles over your heads.
  - listitem: 25 cozy things Sofas, pianos, aquariums, bonsai… recolour them and drag them anywhere.
  - listitem: See your progress Day-to-year stats by subject, streaks and a friendly leaderboard.
- paragraph: Made with tiny pixels and lots of focus.
- status
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | test.describe('Auralis - Full Feature Tests', () => {
  4   |   test.beforeEach(async ({ page }) => {
  5   |     await page.goto('/');
  6   |     await page.waitForLoadState('networkidle');
  7   |   });
  8   | 
  9   |   test.describe('Authentication & House', () => {
  10  |     test('can sign up and create a house', async ({ page }) => {
  11  |       await page.fill('#authEmail', `test${Date.now()}@example.com`);
  12  |       await page.fill('#authPass', 'password123');
  13  |       await page.fill('#authConfirm', 'password123');
  14  |       await page.fill('#authUser', `TestUser${Date.now()}`);
  15  |       await page.click('#authSubmit');
> 16  |       await expect(page.locator('#side')).toBeVisible({ timeout: 15000 });
      |                                           ^ Error: expect(locator).toBeVisible() failed
  17  |       await expect(page.locator('.code-big')).toBeVisible();
  18  |     });
  19  |   });
  20  | 
  21  |   test.describe('To-Dos', () => {
  22  |     test.beforeEach(async ({ page }) => {
  23  |       await page.fill('#authEmail', `todo${Date.now()}@example.com`);
  24  |       await page.fill('#authPass', 'password123');
  25  |       await page.fill('#authConfirm', 'password123');
  26  |       await page.fill('#authUser', `TodoUser${Date.now()}`);
  27  |       await page.click('#authSubmit');
  28  |       await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
  29  |     });
  30  | 
  31  |     test('can create a basic to-do', async ({ page }) => {
  32  |       await page.click('#todoNewBtn');
  33  |       await page.fill('#todoText', 'Test to-do item');
  34  |       await page.click('#todoSave');
  35  |       await expect(page.locator('#todoList li:not(.empty)')).toContainText('Test to-do item');
  36  |     });
  37  | 
  38  |     test('can create a to-do with due date', async ({ page }) => {
  39  |       await page.click('#todoNewBtn');
  40  |       await page.fill('#todoText', 'To-do with date');
  41  |       const tomorrow = new Date();
  42  |       tomorrow.setDate(tomorrow.getDate() + 1);
  43  |       const dateStr = tomorrow.toISOString().split('T')[0];
  44  |       await page.fill('#todoDate', dateStr);
  45  |       await page.fill('#todoTime', '10:00');
  46  |       await page.click('#todoSave');
  47  |       await expect(page.locator('#todoList li:not(.empty)')).toContainText('To-do with date');
  48  |       await expect(page.locator('.due')).toBeVisible();
  49  |     });
  50  | 
  51  |     test('can create recurring to-do', async ({ page }) => {
  52  |       await page.click('#todoNewBtn');
  53  |       await page.fill('#todoText', 'Daily task');
  54  |       await page.selectOption('#todoRepeat', 'daily');
  55  |       const nextWeek = new Date();
  56  |       nextWeek.setDate(nextWeek.getDate() + 7);
  57  |       const dateStr = nextWeek.toISOString().split('T')[0];
  58  |       await page.fill('#todoRepeatUntil', dateStr);
  59  |       await page.click('#todoSave');
  60  |       await expect(page.locator('#todoList li:not(.empty)')).toContainText('Daily task');
  61  |       await expect(page.locator('.pill.repeat')).toContainText('daily');
  62  |     });
  63  | 
  64  |     test('can set task priority', async ({ page }) => {
  65  |       await page.click('#todoNewBtn');
  66  |       await page.fill('#todoText', 'High priority task');
  67  |       await page.selectOption('#todoPriority', 'high');
  68  |       await page.click('#todoSave');
  69  |       await expect(page.locator('#todoList li:not(.empty)')).toContainText('High priority task');
  70  |       await expect(page.locator('.pill.priority-high')).toBeVisible();
  71  |     });
  72  | 
  73  |     test('can add subtasks', async ({ page }) => {
  74  |       await page.click('#todoNewBtn');
  75  |       await page.fill('#todoText', 'Task with subtasks');
  76  |       await page.click('#todoAddSubtask');
  77  |       await page.fill('#todoSubtasks input[type="text"]', 'Subtask 1');
  78  |       await page.click('#todoAddSubtask');
  79  |       await page.fill('#todoSubtasks input[type="text"]:nth-of-type(2)', 'Subtask 2');
  80  |       await page.click('#todoSave');
  81  |       await expect(page.locator('#todoList li:not(.empty)')).toContainText('Task with subtasks');
  82  |       await expect(page.locator('.todo-subtask')).toHaveCount(2);
  83  |     });
  84  | 
  85  |     test('can tick subtasks', async ({ page }) => {
  86  |       await page.click('#todoNewBtn');
  87  |       await page.fill('#todoText', 'Task for subtask test');
  88  |       await page.click('#todoAddSubtask');
  89  |       await page.fill('#todoSubtasks input[type="text"]', 'Subtask to tick');
  90  |       await page.click('#todoSave');
  91  |       await expect(page.locator('.todo-subtask input[type="checkbox"]')).toHaveCount(1);
  92  |       await page.click('.todo-subtask input[type="checkbox"]');
  93  |       await expect(page.locator('.todo-subtask.done')).toHaveCount(1);
  94  |     });
  95  | 
  96  |     test('can edit a to-do', async ({ page }) => {
  97  |       await page.click('#todoNewBtn');
  98  |       await page.fill('#todoText', 'Original text');
  99  |       await page.click('#todoSave');
  100 |       await page.click('#todoList button[data-todo="edit"]');
  101 |       await page.fill('#todoText', 'Edited text');
  102 |       await page.click('#todoSave');
  103 |       await expect(page.locator('#todoList li:not(.empty)')).toContainText('Edited text');
  104 |     });
  105 | 
  106 |     test('can delete a to-do', async ({ page }) => {
  107 |       await page.click('#todoNewBtn');
  108 |       await page.fill('#todoText', 'To delete');
  109 |       await page.click('#todoSave');
  110 |       await expect(page.locator('#todoList li:not(.empty)')).toContainText('To delete');
  111 |       await page.click('#todoList button[data-todo="del"]');
  112 |       await expect(page.locator('#todoList li:not(.empty)')).not.toContainText('To delete');
  113 |     });
  114 | 
  115 |     test('can assign to-do to house members', async ({ page }) => {
  116 |       // This test would need multiple users - skipping for single-user setup
```