import { describe, expect, it } from 'vitest';
import {
   ISSUE_LIFECYCLES,
   MY_ISSUES_TABS,
   MY_ISSUES_TAB_ITEMS,
   WORK_PRIORITIES,
} from './constants';

describe('features/issues/constants', () => {
   it('exports MY_ISSUES_TABS as an array supporting .includes()', () => {
      expect(Array.isArray(MY_ISSUES_TABS)).toBe(true);
      expect(typeof MY_ISSUES_TABS.includes).toBe('function');
      expect(MY_ISSUES_TABS.includes('all')).toBe(true);
      expect(MY_ISSUES_TABS.includes('assigned')).toBe(true);
      expect(MY_ISSUES_TABS.includes('created')).toBe(true);
      expect(MY_ISSUES_TABS.includes('subscribed')).toBe(true);
      expect(MY_ISSUES_TABS.includes('activity')).toBe(true);
      expect(MY_ISSUES_TABS.includes('invalid' as any)).toBe(false);
   });

   it('exports MY_ISSUES_TAB_ITEMS matching all MY_ISSUES_TABS values', () => {
      expect(MY_ISSUES_TAB_ITEMS).toHaveLength(MY_ISSUES_TABS.length);
      const values = MY_ISSUES_TAB_ITEMS.map((item) => item.value);
      for (const tab of MY_ISSUES_TABS) {
         expect(values).toContain(tab);
      }
   });

   it('exports ISSUE_LIFECYCLES supporting .includes()', () => {
      expect(Array.isArray(ISSUE_LIFECYCLES)).toBe(true);
      expect(ISSUE_LIFECYCLES.includes('active')).toBe(true);
      expect(ISSUE_LIFECYCLES.includes('archived')).toBe(true);
      expect(ISSUE_LIFECYCLES.includes('deleted')).toBe(true);
      expect(ISSUE_LIFECYCLES.includes('unknown' as any)).toBe(false);
   });

   it('exports WORK_PRIORITIES supporting .includes()', () => {
      expect(Array.isArray(WORK_PRIORITIES)).toBe(true);
      expect(WORK_PRIORITIES.includes('URGENT')).toBe(true);
      expect(WORK_PRIORITIES.includes('HIGH')).toBe(true);
      expect(WORK_PRIORITIES.includes('MEDIUM')).toBe(true);
      expect(WORK_PRIORITIES.includes('LOW')).toBe(true);
      expect(WORK_PRIORITIES.includes('NO_PRIORITY')).toBe(true);
   });
});
