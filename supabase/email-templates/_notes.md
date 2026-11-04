# E-mails Auth — Bar da Cácia

Cole cada par `*.subject.txt` + `*.html` em **Supabase → Authentication → Email Templates**.

Logo usada nos HTML (URL absoluta pública após o deploy Pages):

`https://cacia.inspira.dev.br/email-logo.png`

Se o site ainda estiver só no GitHub Pages, use:

`https://coletivo-inspira.github.io/bardacassia/email-logo.png`

Variáveis Go do Auth: `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .Token }}`.

O remetente `Supabase Auth <noreply@mail.app.supabase.io>` só muda com **Custom SMTP** no painel.
