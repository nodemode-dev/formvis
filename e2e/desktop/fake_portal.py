"""A stand-in desktop file portal on a private session bus: `python3 fake_portal.py <bus address> error` answers every
FileChooser OpenFile with org.freedesktop.portal.Error.Failed, the failure that leaves a GTK file dialog waiting with
nothing on screen. Needs jeepney."""
import sys
import time

import jeepney
from jeepney import MessageType, new_method_return
from jeepney.io.blocking import open_dbus_connection
from jeepney.wrappers import new_error


def main() -> None:
    conn = open_dbus_connection(bus=sys.argv[1])
    print("name", conn.send_and_get_reply(jeepney.bus_messages.message_bus.RequestName("org.freedesktop.portal.Desktop")).body, flush=True)
    while True:
        m = conn.receive()
        if m.header.message_type != MessageType.method_call:
            continue
        member = m.header.fields.get(jeepney.HeaderFields.member)
        print("call", round(time.time() % 1000, 3), member, flush=True)
        if member in ("OpenFile", "SaveFile"):
            conn.send(new_error(m, "org.freedesktop.portal.Error.Failed", "s", ("no backend",)))
        elif member == "Get":
            conn.send(new_method_return(m, "v", (("u", 3),)))
        elif member == "GetAll":
            conn.send(new_method_return(m, "a{sv}", ({"version": ("u", 3)},)))
        elif member == "Introspect":
            conn.send(new_method_return(m, "s", ("<node/>",)))
        else:
            conn.send(new_error(m, "org.freedesktop.DBus.Error.UnknownMethod", "s", ("not here",)))


if __name__ == "__main__":
    main()
