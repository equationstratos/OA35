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

# motor pads for channel 1, in board coordinates; other channels are these
# points rotated by -90 degrees per channel
MOTOR_PADS = [(16.3, 10.4, 90.0), (16.3, 13.6, 90.0), (13.6, 16.3, 0.0)]

# --------------------------------------------------------------- top side --
TOP = {
    'J3': (4.2, 15.3, 0.0),      # BAT+ / capacitor
    'J4': (9.4, 15.3, 0.0),      # BAT-
    'RS1': (6.8, 11.2, 0.0),     # 0.2 mOhm shunt
    'U1': (1.6, 12.9, 0.0),      # INA186, right at the shunt
}

# ------------------------------------------------------------ bottom side --
BOTTOM = {
    'U6': (0.0, 0.0, 0.0),           # STM32F722RET6
    'U7': (0.0, 9.4, 0.0),           # ICM-42688-P
    'U8': (4.6, -8.6, 0.0),          # BMP280
    'U9': (0.0, 14.6, 0.0),          # W25Q128 blackbox
    'J1': (-14.35, 0.0, 90.0),       # USB-C, front face flush with the edge
    'J2': (0.0, -14.4, 0.0),         # HD VTX, front edge
    'U2': (9.9, 3.2, 0.0),           # 9.85 V buck
    'L1': (13.7, 3.2, 90.0),
    'U3': (9.9, -3.2, 0.0),          # 5 V buck
    'L2': (13.7, -3.2, 90.0),
    'U20': (10.0, 9.2, 45.0),        # ESC 1 micro
    'U30': (10.0, -9.2, 315.0),      # ESC 2 micro
    'U40': (-10.0, 9.2, 135.0),      # ESC 3 micro
    'U50': (-10.0, -9.2, 225.0),     # ESC 4 micro
    'U10': (-8.0, 0.0, 90.0),        # USB ESD array, between connector and MCU
}

# IO pads: a row along the front edge, then down both sides
PADS = [
    ('P1', -15.2, -16.6, 0.0), ('P2', -12.6, -16.6, 0.0),
    ('P3', -10.0, -16.6, 0.0), ('P4', -7.4, -16.6, 0.0),
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
    # flight controller SWD / boot, bottom side next to the MCU
    'TP1': (-6.0, 8.0, 0.0), 'TP2': (-4.0, 8.0, 0.0),
    'TP3': (-6.0, 9.6, 0.0), 'TP4': (-4.0, 9.6, 0.0),
    'TP5': (-6.0, 11.2, 0.0), 'TP6': (-4.0, 11.2, 0.0),
    # ESC SWD, two pads next to each ESC micro
    'TP7': (14.8, 7.4, 0.0), 'TP8': (14.8, 5.6, 0.0),
    'TP9': (14.8, -7.4, 0.0), 'TP10': (14.8, -5.6, 0.0),
    'TP11': (-14.8, 7.4, 0.0), 'TP12': (-14.8, 5.6, 0.0),
    'TP13': (-14.8, -7.4, 0.0), 'TP14': (-14.8, -5.6, 0.0),
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
