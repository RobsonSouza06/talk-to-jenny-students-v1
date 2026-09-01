# Talk To Jenny — Student Space

Aplicativo educacional para o acompanhamento das aulas de inglês da Talk To
Jenny.

A plataforma possui uma área da professora para organizar alunos, livros,
lições, atividades e progresso, além de uma área individual para cada aluno
acessar o conteúdo liberado.

O aplicativo funciona em computadores e celulares e pode ser instalado como
PWA.

Desenvolvido com Next.js e Firebase.

## Áudios do Audio.com

Cada bloco da lição pode receber um único áudio opcional, sem armazenar o
arquivo no Firebase:

1. Envie o arquivo de áudio para o Audio.com e deixe-o como **Unlisted**.
2. Na página do áudio, escolha **Share → Embed**.
3. Copie o código do player.
4. No painel da professora, edite o bloco e cole o código em **Áudio do bloco**.

O ícone de reprodução só aparece quando o bloco possui um endereço válido do
Audio.com. O player é carregado apenas depois do clique.

Ao criar ou editar um bloco, é possível escolher o tipo **História**. Histórias
com áudio começam com o texto oculto e oferecem o botão **Mostrar texto**;
histórias sem áudio continuam mostrando o texto normalmente.
