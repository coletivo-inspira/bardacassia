# E-mails Auth — Bar da Cácia

Cole cada par `*.subject.txt` + `*.html` em **Supabase → Authentication → Email Templates**.

## Logo (URL absoluta)

Os HTML usam:

`https://cacia.inspira.dev.br/email-logo.png`

Arquivo no repo: [`public/email-logo.png`](../../public/email-logo.png) (raster do `logo_bar_da_cacia.svg`). Depois do deploy Pages, confira se a URL abre. Se o site ainda estiver só no GitHub Pages, troque nos HTML para:

`https://coletivo-inspira.github.io/bardacassia/email-logo.png`

## Variáveis Go do Auth

Use exatamente estas nos templates (sintaxe do Go template do Supabase Auth):

- `{{ .ConfirmationURL }}` — link do CTA e fallback
- `{{ .SiteURL }}` — URL do site (opcional no rodapé)
- `{{ .Email }}` — e-mail do destinatário (opcional)
- `{{ .Token }}` — código OTP (não usado nestes templates de link)

## Remetente / SMTP

O `From:` padrão (`Supabase Auth <noreply@mail.app.supabase.io>`) e o rodapé genérico do mailer gratuito **só mudam** com **Custom SMTP** no Dashboard (Resend, SendGrid, etc.). Este pacote altera o corpo e o assunto; não configura SMTP no app.

## Mapa painel ↔ arquivos

| Template no Dashboard | Subject | Body |
| --- | --- | --- |
| Magic Link | `magic_link.subject.txt` | `magic_link.html` |
| Confirm signup | `confirm_signup.subject.txt` | `confirm_signup.html` |
| Reset password | `recovery.subject.txt` | `recovery.html` |
| Change email address | `email_change.subject.txt` | `email_change.html` |
