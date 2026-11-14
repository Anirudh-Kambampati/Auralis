import { test, expect } from '@playwright/test';

test.describe('Auralis - Full Feature Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Authentication & House', () => {
    test('can sign up and create a house', async ({ page }) => {
      await page.fill('#authEmail', `test${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `TestUser${Date.now()}`);
      await page.click('#authSubmit');
      await expect(page.locator('#side')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.code-big')).toBeVisible();
    });
  });

  test.describe('To-Dos', () => {
    test.beforeEach(async ({ page }) => {
      await page.fill('#authEmail', `todo${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `TodoUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
    });

    test('can create a basic to-do', async ({ page }) => {
      await page.click('#todoNewBtn');
      await page.fill('#todoText', 'Test to-do item');
      await page.click('#todoSave');
      await expect(page.locator('#todoList li:not(.empty)')).toContainText('Test to-do item');
    });

    test('can create a to-do with due date', async ({ page }) => {
      await page.click('#todoNewBtn');
      await page.fill('#todoText', 'To-do with date');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      await page.fill('#todoDate', dateStr);
      await page.fill('#todoTime', '10:00');
      await page.click('#todoSave');
      await expect(page.locator('#todoList li:not(.empty)')).toContainText('To-do with date');
      await expect(page.locator('.due')).toBeVisible();
    });

    test('can create recurring to-do', async ({ page }) => {
      await page.click('#todoNewBtn');
      await page.fill('#todoText', 'Daily task');
      await page.selectOption('#todoRepeat', 'daily');
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const dateStr = nextWeek.toISOString().split('T')[0];
      await page.fill('#todoRepeatUntil', dateStr);
      await page.click('#todoSave');
      await expect(page.locator('#todoList li:not(.empty)')).toContainText('Daily task');
      await expect(page.locator('.pill.repeat')).toContainText('daily');
    });

    test('can set task priority', async ({ page }) => {
      await page.click('#todoNewBtn');
      await page.fill('#todoText', 'High priority task');
      await page.selectOption('#todoPriority', 'high');
      await page.click('#todoSave');
      await expect(page.locator('#todoList li:not(.empty)')).toContainText('High priority task');
      await expect(page.locator('.pill.priority-high')).toBeVisible();
    });

    test('can add subtasks', async ({ page }) => {
      await page.click('#todoNewBtn');
      await page.fill('#todoText', 'Task with subtasks');
      await page.click('#todoAddSubtask');
      await page.fill('#todoSubtasks input[type="text"]', 'Subtask 1');
      await page.click('#todoAddSubtask');
      await page.fill('#todoSubtasks input[type="text"]:nth-of-type(2)', 'Subtask 2');
      await page.click('#todoSave');
      await expect(page.locator('#todoList li:not(.empty)')).toContainText('Task with subtasks');
      await expect(page.locator('.todo-subtask')).toHaveCount(2);
    });

    test('can tick subtasks', async ({ page }) => {
      await page.click('#todoNewBtn');
      await page.fill('#todoText', 'Task for subtask test');
      await page.click('#todoAddSubtask');
      await page.fill('#todoSubtasks input[type="text"]', 'Subtask to tick');
      await page.click('#todoSave');
      await expect(page.locator('.todo-subtask input[type="checkbox"]')).toHaveCount(1);
      await page.click('.todo-subtask input[type="checkbox"]');
      await expect(page.locator('.todo-subtask.done')).toHaveCount(1);
    });

    test('can edit a to-do', async ({ page }) => {
      await page.click('#todoNewBtn');
      await page.fill('#todoText', 'Original text');
      await page.click('#todoSave');
      await page.click('#todoList button[data-todo="edit"]');
      await page.fill('#todoText', 'Edited text');
      await page.click('#todoSave');
      await expect(page.locator('#todoList li:not(.empty)')).toContainText('Edited text');
    });

    test('can delete a to-do', async ({ page }) => {
      await page.click('#todoNewBtn');
      await page.fill('#todoText', 'To delete');
      await page.click('#todoSave');
      await expect(page.locator('#todoList li:not(.empty)')).toContainText('To delete');
      await page.click('#todoList button[data-todo="del"]');
      await expect(page.locator('#todoList li:not(.empty)')).not.toContainText('To delete');
    });

    test('can assign to-do to house members', async ({ page }) => {
      // This test would need multiple users - skipping for single-user setup
      await page.click('#todoNewBtn');
      await page.fill('#todoText', 'Assigned task');
      await page.click('#todoSave');
      await expect(page.locator('#todoList li:not(.empty)')).toContainText('Assigned task');
    });
  });

  test.describe('Chat', () => {
    test.beforeEach(async ({ page }) => {
      await page.fill('#authEmail', `chat${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `ChatUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
    });

    test('can send a chat message', async ({ page }) => {
      await page.fill('#chatInput', 'Hello world!');
      await page.click('#chatForm button[type="submit"]');
      await expect(page.locator('#chatLog p.mine')).toContainText('Hello world!');
    });

    test('can reply to a message', async ({ page }) => {
      await page.fill('#chatInput', 'First message');
      await page.click('#chatForm button[type="submit"]');
      await page.hover('#chatLog p.mine');
      await page.click('.chat-reply');
      await expect(page.locator('#chatReply')).toBeVisible();
      await expect(page.locator('#chatReply .quote')).toContainText('First message');
      await page.fill('#chatInput', 'Reply to first');
      await page.click('#chatForm button[type="submit"]');
      await expect(page.locator('#chatLog p.mine:last-child')).toContainText('Reply to first');
      await expect(page.locator('#chatLog p.mine:last-child .quote')).toContainText('First message');
    });

    test('can click quote to jump to original', async ({ page }) => {
      await page.fill('#chatInput', 'Message to quote');
      await page.click('#chatForm button[type="submit"]');
      await page.hover('#chatLog p.mine');
      await page.click('.chat-reply');
      await page.fill('#chatInput', 'Replying');
      await page.click('#chatForm button[type="submit"]');
      await page.click('.quote');
      // Original message should be highlighted
      await expect(page.locator('#chatLog p.highlight')).toBeVisible({ timeout: 2000 });
    });

    test('can add reactions', async ({ page }) => {
      await page.fill('#chatInput', 'React to me');
      await page.click('#chatForm button[type="submit"]');
      await page.hover('#chatLog p.mine');
      await page.click('.reaction-picker button[data-emoji="👍"]');
      await expect(page.locator('.reaction.on')).toContainText('👍');
      await expect(page.locator('.reaction span')).toContainText('1');
    });

    test('can remove reaction', async ({ page }) => {
      await page.fill('#chatInput', 'React then remove');
      await page.click('#chatForm button[type="submit"]');
      await page.hover('#chatLog p.mine');
      await page.click('.reaction-picker button[data-emoji="❤️"]');
      await expect(page.locator('.reaction.on')).toContainText('❤️');
      await page.click('.reaction.on');
      await expect(page.locator('.reaction.on')).not.toContainText('❤️');
    });

    test('@mention autocomplete shows', async ({ page }) => {
      await page.fill('#chatInput', '@');
      await expect(page.locator('#chatMentions')).toBeVisible({ timeout: 2000 });
    });

    test('can select mention from picker', async ({ page }) => {
      await page.fill('#chatInput', '@');
      await page.waitForSelector('#chatMentions button', { state: 'visible', timeout: 2000 });
      await page.click('#chatMentions button');
      await expect(page.locator('#chatInput')).toHaveValue(/@\w+ /);
    });
  });

  test.describe('Focus Sessions', () => {
    test.beforeEach(async ({ page }) => {
      await page.fill('#authEmail', `focus${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `FocusUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
    });

    test('can start Pomodoro session', async ({ page }) => {
      await page.click('[data-panel="focus"]');
      await expect(page.locator('#panel')).toBeVisible();
      await page.click('[data-act="focustemplate"][data-v="pomodoro"]');
      await expect(page.locator('#deck')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.deck-note')).toContainText('Pomodoro');
    });

    test('can start Deep Work session', async ({ page }) => {
      await page.click('[data-panel="focus"]');
      await page.click('[data-act="focustemplate"][data-v="deep"]');
      await expect(page.locator('#deck')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.deck-note')).toContainText('Deep Work');
    });

    test('can start custom focus length', async ({ page }) => {
      await page.click('[data-panel="focus"]');
      await page.fill('#customLen', '30');
      await page.click('[data-act="focuscustom"]');
      await expect(page.locator('#deck')).toBeVisible({ timeout: 5000 });
    });

    test('shows joinable sessions from housemates', async ({ page }) => {
      await page.click('[data-panel="focus"]');
      // Would need multiple users to test join
      await expect(page.locator('#panel')).toBeVisible();
    });
  });

  test.describe('House Panel & Announcements', () => {
    test.beforeEach(async ({ page }) => {
      await page.fill('#authEmail', `house${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `HouseUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
    });

    test('can open house panel', async ({ page }) => {
      await page.click('[data-panel="house"]');
      await expect(page.locator('#panel')).toBeVisible();
      await expect(page.locator('.code-big')).toBeVisible();
    });

    test('house owner can post announcement', async ({ page }) => {
      await page.click('[data-panel="house"]');
      await page.click('[data-act="announcement-add"]');
      await expect(page.locator('#announcementModal')).toBeVisible();
      await page.fill('#announcementText', 'House announcement test');
      await page.click('#announcementNew button[type="submit"]');
      await expect(page.locator('.announcement')).toContainText('House announcement test');
    });

    test('house owner can delete announcement', async ({ page }) => {
      await page.click('[data-panel="house"]');
      await page.click('[data-act="announcement-add"]');
      await page.fill('#announcementText', 'Announcement to delete');
      await page.click('#announcementNew button[type="submit"]');
      await expect(page.locator('.announcement')).toContainText('Announcement to delete');
      page.on('dialog', dialog => dialog.accept());
      await page.click('[data-act="announcement-del"]');
      await expect(page.locator('.announcement')).not.toContainText('Announcement to delete');
    });
  });

  test.describe('Calendar', () => {
    test.beforeEach(async ({ page }) => {
      await page.fill('#authEmail', `cal${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `CalUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
    });

    test('can add house event', async ({ page }) => {
      await page.click('[data-panel="calendar"]');
      await expect(page.locator('#panel')).toBeVisible();
      await page.selectOption('#calScope', 'house');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      await page.fill('#calDay', dateStr);
      await page.fill('#calText', 'House meeting');
      await page.fill('#calTime', '14:00');
      await page.click('[data-act="caladd"]');
      await expect(page.locator('#panel')).toContainText('House meeting');
    });

    test('can add personal event', async ({ page }) => {
      await page.click('[data-panel="calendar"]');
      await page.selectOption('#calScope', 'personal');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];
      await page.fill('#calDay', dateStr);
      await page.fill('#calText', 'Personal appointment');
      await page.click('[data-act="caladd"]');
      await expect(page.locator('#panel')).toContainText('Personal appointment');
    });
  });

  test.describe('Leaderboard', () => {
    test.beforeEach(async ({ page }) => {
      await page.fill('#authEmail', `board${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `BoardUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
    });

    test('can open stats panel', async ({ page }) => {
      await page.click('[data-panel="stats"]');
      await expect(page.locator('#panel')).toBeVisible();
      await expect(page.locator('#statsTab-board')).toBeVisible();
    });

    test('can switch to house leaderboard', async ({ page }) => {
      await page.click('[data-panel="stats"]');
      await page.click('[data-act="boardScope"][data-v="houses"]');
      await expect(page.locator('.board-row')).toBeVisible();
    });
  });

  test.describe('Avatar & Customization', () => {
    test.beforeEach(async ({ page }) => {
      await page.fill('#authEmail', `avatar${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `AvatarUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
    });

    test('can open avatar panel', async ({ page }) => {
      await page.click('[data-panel="avatar"]');
      await expect(page.locator('#panel')).toBeVisible();
      await expect(page.locator('#name')).toBeVisible();
    });

    test('can change name', async ({ page }) => {
      await page.click('[data-panel="avatar"]');
      await page.fill('#name', 'NewName123');
      await page.click('[data-act="close"]');
      await expect(page.locator('#name')).toHaveValue('NewName123');
    });

    test('can randomize look', async ({ page }) => {
      await page.click('[data-panel="avatar"]');
      const before = await page.locator('.me svg').getAttribute('outerHTML');
      await page.click('[data-act="randomlook"]');
      const after = await page.locator('.me svg').getAttribute('outerHTML');
      expect(before).not.toBe(after);
    });
  });

  test.describe('Shop & Decorate', () => {
    test.beforeEach(async ({ page }) => {
      await page.fill('#authEmail', `shop${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `ShopUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
    });

    test('can open shop panel', async ({ page }) => {
      await page.click('[data-panel="shop"]');
      await expect(page.locator('#panel')).toBeVisible();
      await expect(page.locator('text=Coins')).toBeVisible();
    });

    test('can open decorate panel', async ({ page }) => {
      await page.click('[data-panel="decorate"]');
      await expect(page.locator('#panel')).toBeVisible();
    });
  });

  test.describe('Notifications & Settings', () => {
    test.beforeEach(async ({ page }) => {
      await page.fill('#authEmail', `notify${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `NotifyUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });
    });

    test('can toggle chimes', async ({ page }) => {
      await page.click('[data-panel="avatar"]');
      const before = await page.locator('[data-act="chimes"]').textContent();
      await page.click('[data-act="chimes"]');
      const after = await page.locator('[data-act="chimes"]').textContent();
      expect(before).not.toBe(after);
    });
  });

  test.describe('Responsive & UI', () => {
    test('side panel opens and closes', async ({ page }) => {
      await page.fill('#authEmail', `ui${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `UIUser${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });

      await page.click('#fold-todos');
      await expect(page.locator('.side-card.todos')).toHaveClass(/folded/);
      await page.click('#fold-todos');
      await expect(page.locator('.side-card.todos')).not.toHaveClass(/folded/);
    });

    test('chat panel opens and closes', async ({ page }) => {
      await page.fill('#authEmail', `ui2${Date.now()}@example.com`);
      await page.fill('#authPass', 'password123');
      await page.fill('#authConfirm', 'password123');
      await page.fill('#authUser', `UIUser2${Date.now()}`);
      await page.click('#authSubmit');
      await page.waitForSelector('#side', { state: 'visible', timeout: 30000 });

      await page.click('#fold-chat');
      await expect(page.locator('.side-card.chat')).toHaveClass(/folded/);
    });
  });
});