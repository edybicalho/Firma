import { describe, expect, it } from 'vitest';
import { lastAccessLabel } from '@/lib/types';

describe('último acesso (horário de Brasília)', () => {
  const agora = new Date('2026-11-12T20:00:00Z'); // 17:00 em Brasília
  it.each([
    [null, 'Nunca entrou'],
    ['2026-11-12T17:30:00Z', 'hoje às 14:30'],
    ['2026-11-12T02:30:00Z', 'ontem às 23:30'], // 23:30 do dia 11 em Brasília (já era dia 12 em UTC)
    ['2026-11-11T12:12:00Z', 'ontem às 09:12'],
    ['2026-11-07T12:00:00Z', 'há 5 dias'],
    ['2026-03-12T12:00:00Z', '12/03/2026'],
  ])('%s → %s', (iso, texto) => expect(lastAccessLabel(iso, agora)).toBe(texto));
});
