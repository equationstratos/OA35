"""OA35-AIO floorplan.

Board-local millimetres, origin at the board centre, +X right, +Y rear.
Front of the aircraft is -Y.  Motor numbering is Betaflight's: M1 rear-right,
M2 front-right, M3 rear-left, M4 front-left.

Top side (F.Cu) is the ESC power stage, arranged as a pinwheel: one channel
per edge, FET array lying along that edge, motor pads in the corner the
channel points at.  Bottom side (B.Cu) is the flight controller, the
switching supplies, the four ESC micros and all wire pads.

Only the parts whose position actually matters are listed here.  The
remaining ~150 passives are placed automatically next to the pins they
connect to, see place_auto() in gen_pcb.py.
"""

BOARD = 36.0
CORNER_R = 2.0
MOUNT_XY = 12.75
MOUNT_D = 3.0
EDGE_CLR = 0.4

# ---------------------------------------------------------------- channels --
# frame origin and rotation; local +x runs along the edge towards the motor
# corner, local +y points inwards
CHANNEL_FRAME = {
    1: (15.0, 5.0, 90.0),
    2: (5.0, -15.0, 0.0),
    3: (-5.0, 15.0, 180.0),
    4: (-15.0, -5.0, 270.0),
}
CHANNEL_HALF_W = 4.1          # local |x| the block may occupy
CHANNEL_DEPTH = 15.2          # local y the block may occupy

# FET array, local coordinates.  The footprint is turned so the drain tab
# faces local +y (the battery bus) and the sources face local -y.
FET_X = {'A': 2.78, 'B': 0.0, 'C': -2.78}
FET_Y_LOW = 2.25
FET_Y_HIGH = 7.0
FET_ANGLE = 90.0

DRIVER_LOCAL = (0.0, 12.7, 0.0)

# The gate network, in channel coordinates.
#
# Left to the automatic placement these end up outside the channel entirely --
# a gate resistor 9.8 mm from both pads it joins, a driver decoupling cap
# 12 mm from the pin it decouples -- because the power block leaves no free
# ring for them and the search spirals until it finds one somewhere else.
# There are exactly three free bands in a channel, and the gate network fits
# in them:
#
#   y -2.5 .. 0.4    outside the low MOSFET row, towards the board edge
#   y  3.9 .. 5.3    between the two rows, above the low drain tabs
#   y  8.7 .. 10.3   between the high row and the driver
#
GATE_PAD_DX = -0.97           # gate pad offset within a MOSFET
GATE_R_LOW_Y = -0.9           # low-side gate resistors, outer band
GATE_R_HIGH_Y = 4.6           # high-side gate resistors, between the rows
BOOTSTRAP_Y = 9.5             # bootstrap capacitors, under the driver
VCC_CAP_LOCAL = (4.0, 12.45, 90.0)     # driver rail decoupling, clear of its fanout ring

# motor pads for channel 1, in board coordinates; other channels are these
# points rotated by -90 degrees per channel
MOTOR_PADS = [(16.3, 10.4, 90.0), (16.3, 13.6, 90.0), (13.6, 16.3, 0.0)]

# --------------------------------------------------------------- top side --
TOP = {
    'J3': (3.6, 15.3, 0.0),      # BAT+ / capacitor
    'J4': (8.8, 15.3, 0.0),      # BAT-, clear of the rear-right mounting hole
    'RS1': (6.8, 11.2, 0.0),     # 0.2 mOhm shunt
    'U1': (1.0, 12.4, 0.0),      # INA186, right at the shunt
}

# ------------------------------------------------------------ bottom side --
BOTTOM = {
    'U6': (0.0, 0.0, 0.0),           # STM32F722RET6
    'U7': (0.0, 9.4, 0.0),           # ICM-42688-P
    'U8': (-3.2, -8.2, 0.0),         # BMP280
    'U9': (1.0, 14.9, 0.0),          # W25Q128 blackbox
    # USB-C sits on the front edge, left of centre: the left edge belongs to
    # channel 4, and the connector's shell posts are through-hole, so putting
    # it there would eat the top side as well.
    'J1': (-4.18, -11.43, 180.0),
    # the HD VTX pads are surface mount only, so they can share the left edge
    # with channel 4's power stage on the other side of the board
    'J2': (-14.7, 1.4, 90.0),
    'U2': (9.5, 0.0, 0.0),           # 9.85 V buck
    'L1': (13.6, 0.0, 90.0),
    'U3': (9.5, -4.2, 0.0),          # 5 V BEC
    'L2': (13.6, -4.2, 90.0),
    # each ESC micro sits directly under its own channel's MOSFET array, so
    # the sixty-odd nets between micro, gate driver and power stage stay
    # inside one quadrant instead of crossing the middle of the board
    'U20': (10.4, 5.0, 90.0),        # ESC 1 micro
    'U30': (5.0, -10.4, 0.0),        # ESC 2 micro
    'U40': (-5.0, 9.8, 180.0),       # ESC 3 micro
    'U50': (-10.4, -5.7, 270.0),     # ESC 4 micro
    'U10': (-11.5, -9.7, 0.0),       # USB ESD array, beside the connector
}

# IO pads: a row along the front edge, then down both sides
PADS = [
    ('P1', -15.2, -16.6, 0.0), ('P2', -12.6, -16.6, 0.0),
    ('P3', -8.0, 16.6, 0.0), ('P4', -5.4, 16.6, 0.0),
    ('P5', 7.4, -16.6, 0.0), ('P6', 10.0, -16.6, 0.0),
    ('P7', 12.6, -16.6, 0.0), ('P8', 15.2, -16.6, 0.0),
    ('P9', 16.6, -12.4, 90.0), ('P10', 16.6, -9.8, 90.0),
    ('P11', 16.6, -7.2, 90.0), ('P12', 16.6, -4.6, 90.0),
    ('P13', 16.6, 7.2, 90.0), ('P14', 16.6, 9.8, 90.0),
    ('P15', 16.6, 12.4, 90.0),
    ('P16', -16.6, -12.4, 90.0), ('P17', -16.6, -9.8, 90.0),
    ('P18', -16.6, -7.2, 90.0), ('P19', -16.6, 7.2, 90.0),
    ('P20', -16.6, 9.8, 90.0), ('P21', -16.6, 12.4, 90.0),
    ('P22', -13.2, 16.6, 0.0),
]

# SWD test pads
TEST_PADS = {
    # flight controller SWD / boot, in the free band between the MCU and the
    # VTX pads
    'TP1': (-9.4, 3.9, 90.0), 'TP2': (-7.6, 3.9, 90.0),
    'TP3': (-9.4, 1.7, 90.0), 'TP4': (-7.6, 1.7, 90.0),
    'TP5': (-9.4, -0.5, 90.0), 'TP6': (-7.6, -0.5, 90.0),
    # ESC SWD, two pads next to each ESC micro
    'TP7': (14.5, 4.6, 0.0), 'TP8': (14.5, 3.0, 0.0),
    'TP9': (9.0, -12.0, 0.0), 'TP10': (9.0, -13.6, 0.0),
    'TP11': (-9.0, 12.0, 0.0), 'TP12': (-9.0, 13.6, 0.0),
    'TP13': (-14.5, -6.4, 0.0), 'TP14': (-14.5, -8.0, 0.0),
}

# Silkscreen labels for the wire pads: ref -> text
PAD_LABEL_OFFSET = 1.5


# Decoupling and loop-critical passives: sit next to this reference rather
# than wherever the net centroid happens to fall.  Power rails have too many
# pins for a centroid to mean anything.
NEAR = {
    # STM32F722 supply
    'C25': 'U6', 'C26': 'U6', 'C27': 'U6', 'C28': 'U6', 'C29': 'U6',
    'C30': 'U6', 'C31': 'U6', 'C32': 'U6', 'C33': 'U6', 'C34': 'U6',
    'R8': 'U6', 'R9': 'U6',
    # 9.85 V gate-rail buck
    'C8': 'U2', 'C9': 'U2', 'C10': 'U2', 'C11': 'U2', 'R2': 'U2', 'R3': 'U2',
    'C1': 'U2', 'C2': 'U2',
    # 5 V BEC
    'C12': 'U3', 'C13': 'U3', 'C14': 'U3', 'C15': 'U3', 'R4': 'U3',
    'R5': 'U3', 'C3': 'U3',
    'D3': 'U3', 'D4': 'U3', 'C16': 'U3', 'C17': 'U3', 'C18': 'U3',
    # LDOs
    'C19': 'U4', 'C20': 'U4', 'C21': 'U4', 'C22': 'U4',
    'C23': 'U5', 'C24': 'U5',
    # battery input, shunt and clamp
    'C4': 'RS1', 'C5': 'RS1', 'C6': 'RS1', 'C44': 'J3',
    'D1': 'J3', 'D2': 'J4', 'U1': 'RS1', 'R1': 'RS1', 'C7': 'RS1',
    # sensors and memory
    'C38': 'U7', 'C39': 'U7', 'R19': 'U7',
    'C40': 'U8', 'R20': 'U8', 'R21': 'U8',
    'C41': 'U9', 'R22': 'U9',
    # USB
    'C42': 'J1', 'C43': 'J1', 'R23': 'J1', 'R24': 'J1', 'U10': 'J1',
}
for _ch in (1, 2, 3, 4):
    NEAR['CVCC%d' % _ch] = 'U%d1' % (_ch + 1)
    for _r in ('CVDD', 'CVDA', 'CRST', 'RVDA', 'RRST', 'RBT0'):
        NEAR['%s%d' % (_r, _ch)] = 'U%d0' % (_ch + 1)
