# Security policy

## Supported versions

Security fixes go into the newest release. Please update before reporting, and
check whether the problem is still there.

| Version | Supported |
| --- | --- |
| Latest release | Yes |
| Anything older | No |

## Reporting a vulnerability

**Do not open a public issue for a security problem.** Use GitHub's private
reporting instead: on the repository's **Security** tab, choose **Report a
vulnerability**. Include what you found, the steps to reproduce it, the version and
platform, and what an attacker could do with it.

You can expect an acknowledgement within a week. We will keep you informed while it
is fixed and credit you in the release notes, unless you would rather not be named.

## What counts

FormVis runs on your own machine, so the things that matter most are the ways
something outside it could get in:

- **The engine** listens on loopback (port 8190 in development, a random loopback
  port in the desktop app). Anything that makes it reachable from another machine,
  or lets a web page on another origin drive it.
- **Agents and the MCP server**: an agent acting before the person has allowed it,
  or getting past Agent Connect's per-agent policy and approvals. FormVis asks in its
  window before an outside agent changes anything; the choices are Ask, Allowed and
  Blocked (Preferences > Plugins, Outside agents), and only the FormVis window can
  change the choice or answer a question. The saved choice is sealed: changed
  outside FormVis, it reads as Ask again. Anything that changes the choice, answers
  for the person or acts while the choice is Blocked counts.
- **The terminal dock and Chat**: anything other than FormVis's own window on this
  computer reaching a shell or Claude Code through them. The engine gives the window a
  key at start; requests that change something (other than the MCP endpoint, which is
  asked about as above), and the terminal, Claude Code and agent sockets, are refused
  without it.
- **Plugins and the Script Console**: a plugin or script reaching keys, files or the
  engine beyond the tools FormVis gives it.
- **Provider keys** kept by the engine (fal and the language model set in Preferences):
  anything that leaks them.
- **Files and models**: opening a picture, project or archive in a way that writes
  outside where it should, or a model download getting past its checksum.

Bugs that need someone to already control your machine, or to run a modified build
of FormVis, are ordinary bugs: please open an issue for those.
