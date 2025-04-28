import { clsv, clsx, mtc } from '../clsx.ts';
import { describe, test, expect } from 'vitest';

describe('clsx collection', () => {
    describe('clsx', () => {
        test('should work', () => {
            expect(clsx('fixed', 'border')).toBe('fixed border');
        });
    });
    describe('clsv', () => {
        test('should work', () => {
            const variants = clsv('fixed', {
                variants: {
                    size: { sm: 'text-sm', md: 'text-md', lg: 'text-lg' },
                },
                defaultVariants: {
                    size: 'sm',
                },
            });
            expect(variants({})).toBe('fixed text-sm');
            expect(variants({ size: 'md' })).toBe('fixed text-md');
        });
    });
    describe('mtc', () => {
        test('should work', () => {
            expect(mtc('border border-solid', 'border-dashed')).not.toBe(
                'border border-dashed',
            );
            expect(
                mtc('border border-solid', '~border-solid border-dashed'),
            ).toBe('border border-dashed');
            expect(mtc('px-3 py-4', 'px-2')).toBe('px-2 py-4');
            expect(mtc('px-0 py-1', '~px')).toBe('py-1');
            expect(mtc('border-b-2', '~border')).toBe('border-b-2');
            expect(mtc('border-b-2', '~border-b')).toBe('border-b-2');
            expect(mtc('border-b-2', '~border-b-2')).toBe('');
            expect(mtc('text-center text-sm')).toBe('text-center text-sm');
        });
    });
});
