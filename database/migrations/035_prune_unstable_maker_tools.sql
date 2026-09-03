-- Nexora Maker Stability Hard-Prune
-- Remove maker tools that cannot be guaranteed to stay faithful/reliable.
delete from public.tools
where id in ('fakebankjago', 'brat', 'iqc', 'fakedana', 'fakedev', 'tanyaustadz');

update public.tools
set description = 'Simulasi OVO dari provider original dengan penanda simulasi minimal',
    badge = 'SIMULASI'
where id = 'fakeovo';
