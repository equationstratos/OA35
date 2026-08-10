"""OA35-AIO — netlist definition.

Single source of truth for the board: every component, every pin-to-net
assignment.  The schematic, the PCB, the BOM and the CPL are all generated
from this file, so there is exactly one place where the electrical design
lives.

Board: flight controller (STM32F722RET6) + 4-in-1 AM32 ESC on one 36 x 36 mm
board with a 25.5 x 25.5 mm mounting pattern -- an open equivalent of the
Sub250 RedFox A3 F722 AIO used in the OasisFly35.

The ESC stage topology (AT32F421G8U7 + NSG2065Q + 6 MOSFETs per channel,
BEMF dividers, bootstrap, 0.2 mOhm high-side shunt + INA186) follows
OpenESC-20x20 by incutec / OpenDrone-hw, CERN-OHL-S-2.0.
"""

from collections import OrderedDict

# ---------------------------------------------------------------- library ---

FP = {
    'R0201':   'Resistor_SMD:R_0201_0603Metric',
    'R0402':   'Resistor_SMD:R_0402_1005Metric',
    'R2512':   'Resistor_SMD:R_2512_6332Metric',
    'C0201':   'Capacitor_SMD:C_0201_0603Metric',
    'C0402':   'Capacitor_SMD:C_0402_1005Metric',
    'C0603':   'Capacitor_SMD:C_0603_1608Metric',
    'C0805':   'Capacitor_SMD:C_0805_2012Metric',
    'C1206':   'Capacitor_SMD:C_1206_3216Metric',
    'LED0402': 'LED_SMD:LED_0402_1005Metric',
    'LQFP64':  'Package_QFP:LQFP-64_10x10mm_P0.5mm',
    'QFN28':   'Package_DFN_QFN:QFN-28-1EP_4x4mm_P0.4mm_EP2.4x2.4mm',
    'QFN24':   'oa35:QFN-24-1EP_4x4mm_P0.5mm_EP2.8x2.8mm',
    'PDI3333': 'Package_SON:Diodes_PowerDI3333-8',
    'SOIC8':   'Package_SO:SOIC-8_5.23x5.23mm_P1.27mm',
    'SOT23':   'Package_TO_SOT_SMD:SOT-23',
    'SOT23_6': 'Package_TO_SOT_SMD:SOT-23-6',
    'SOT583':  'Package_TO_SOT_SMD:SOT-583-8',
    'SC70_6':  'Package_TO_SOT_SMD:SOT-363_SC-70-6',
    'WSON6':   'Package_SON:WSON-6-1EP_2x2mm_P0.65mm_EP1x1.6mm',
    'SOD123F': 'Diode_SMD:D_SOD-123F',
    'SOD882':  'Diode_SMD:D_SOD-882',
    'XTAL3225': 'Crystal:Crystal_SMD_3225-4Pin_3.2x2.5mm',
    'USBC':    'Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12',
    'SH6':     'Connector_JST:JST_SH_SM06B-SRSS-TB_1x06-1MP_P1.00mm_Horizontal',
    'IMU':     'oa35:LGA-14_2.5x3mm_P0.5mm_ICM42688',
    'BARO':    'Package_LGA:Bosch_LGA-8_2x2.5mm_P0.65mm_ClockwisePinNumbering',
    'IND3030': 'oa35:L_3.0x3.0mm',
    'PAD_S':   'oa35:Pad_1.6x1.2mm',
    'PAD_M':   'oa35:Pad_2.2x1.6mm',
    'PAD_MOT': 'oa35:Pad_2.8x2.0mm',
    'PAD_L':   'oa35:Pad_4.0x3.0mm',
    'MOUNT':   'oa35:MountingHole_3.0mm',
}

# LCSC part numbers.  Verified against LCSC/JLCPCB listings in 2026-08;
# re-check stock before ordering with tools/verify_bom.py.
LCSC = {
    # 0201 passives -- same parts the OpenESC-20x20 reference design uses
    'R_10R':     'C106226',
    'R_15R':     'C473542',
    'R_220R':    'C226468',
    'R_510R':    'C57784',
    'R_1k':      'C270365',
    'R_2.4k':    'C166281',
    'R_6.49k':   'C2107920',
    'R_10k':     'C106225',
    'R_13.7k':   'C320695',
    'R_100k':    'C270364',
    'C_100n':    'C181043',
    # 0402 / 0805 passives (JLCPCB Basic library)
    'R_5.1k':    'C25905',
    'C_100n_16V': 'C1525',
    'C_20p':     'C1554',
    'C_1u':      'C52923',
    'C_4.7u':    'C23733',
    'C_22u_25V': 'C45783',
    'C_4.7u_50V': 'C98192',
    'LED_G':     'C965793',
    # actives
    'STM32F722RET6':   'C118207',
    'ICM-42688-P':     'C1850418',
    'BMP280':          'C83291',
    'W25Q128JVSIQ':    'C97521',
    'LMR51430YFDDCR':  'C5219261',
    'LP5912-3.3DRVR':  'C524780',
    'TLV76733DRVR':    'C2848334',
    'INA186A3IDCKR':   'C2058245',
    'USBLC6-2SC6':     'C7519',
    '2N7002':          'C8545',
    'AT32F421G8U7':    'C2765098',
    'NSG2065Q':        'C41414478',
    'DOY180N03T':      'C49441966',
    'SMF24A-T13':      'C1977154',
    'RB161QS-40':      'C28646385',
    'RS_0.2m':         'C695806',
    'X32258MSB4SI':    'C2682774',
    'L_4.7u':          'C39846837',
    'TYPE-C-31-M-12':  'C165948',
    'SM06B-SRSS-TB':   'C160405',
}

# Package each LCSC part actually comes in, so a value can never be emitted
# on a land pattern the part does not fit.  Checked by check().
LCSC_PACKAGE = {
    'C106226': '0201', 'C473542': '0201', 'C226468': '0201',
    'C57784': '0201', 'C270365': '0201', 'C166281': '0201',
    'C2107920': '0201', 'C106225': '0201', 'C320695': '0201',
    'C270364': '0201', 'C181043': '0201',
    'C25905': '0402', 'C1525': '0402', 'C1554': '0402', 'C52923': '0402',
    'C23733': '0402', 'C965793': '0402',
    'C45783': '0805', 'C98192': '0805',
    'C695806': '2512',
}

# ------------------------------------------------------------------ model ---


class Part(object):
    __slots__ = ('ref', 'value', 'fp', 'lcsc', 'pins', 'sym', 'block', 'dnp',
                 'desc')

    def __init__(self, ref, value, fp, lcsc, pins, sym, block, dnp=False,
                 desc=''):
        self.ref, self.value, self.fp, self.lcsc = ref, value, fp, lcsc
        self.pins, self.sym, self.block = pins, sym, block
        self.dnp, self.desc = dnp, desc


PARTS = OrderedDict()
_BLOCK = ['']


def block(name):
    _BLOCK[0] = name


def add(ref, value, fp, lcsc, pins, sym='generic', dnp=False, desc=''):
    if ref in PARTS:
        raise ValueError('duplicate reference %s' % ref)
    PARTS[ref] = Part(ref, value, FP[fp], lcsc, dict(pins), sym, _BLOCK[0],
                      dnp, desc)
    return PARTS[ref]


R0402_ONLY = ('5.1k',)


def R(ref, val, a, b, fp=None):
    if fp is None:
        fp = 'R0402' if val in R0402_ONLY else 'R0201'
    return add(ref, val, fp, LCSC['R_' + val], {'1': a, '2': b}, 'R')


# values that have no 0201 part in the BOM: keep the footprint honest
C0402_ONLY = ('20p', '1u', '4.7u', '100n_16V')


def C(ref, val, a, b, fp=None, lcsc=None):
    if fp is None:
        fp = 'C0402' if val in C0402_ONLY else 'C0201'
    return add(ref, val, fp, lcsc or LCSC['C_' + val], {'1': a, '2': b}, 'C')


def LED(ref, anode, cathode):
    return add(ref, 'GREEN', 'LED0402', LCSC['LED_G'],
               {'2': anode, '1': cathode}, 'LED')


# =========================================================================
#  POWER INPUT, PROTECTION, CURRENT SENSE
# =========================================================================
block('POWER')

# Battery pads: 3S-6S.  The battery lead and the low-ESR capacitor both go
# on J3/J4.  BATT+ passes through the shunt before it reaches the MOSFET
# drains, so the INA186 measures total motor plus BEC current.
add('J3', 'BAT+', 'PAD_L', '', {'1': 'VBAT_IN'}, 'PAD')
add('J4', 'BAT-', 'PAD_L', '', {'1': 'GND'}, 'PAD')

add('D1', 'SMF24A-T13', 'SOD123F', LCSC['SMF24A-T13'],
    {'1': 'GND', '2': 'VBAT_IN'}, 'TVS',
    desc='Bidirectional TVS clamp, 24 V standoff')
add('D2', 'SMF24A-T13', 'SOD123F', LCSC['SMF24A-T13'],
    {'1': 'GND', '2': 'VBAT_IN'}, 'TVS',
    desc='Bidirectional TVS clamp, 24 V standoff')

add('RS1', '0.2mR', 'R2512', LCSC['RS_0.2m'],
    {'1': 'VBAT', '2': 'VBAT_IN'}, 'R',
    desc='Current shunt, 1 W 2512, 20 mV/A with INA186A3')

# bulk sits downstream of the shunt, right at the MOSFET drains; the big
# electrolytic the user solders to J_CAP goes upstream, at the input pads
for ref in ('C1', 'C2', 'C3', 'C4', 'C5'):
    C(ref, '4.7u_50V', 'VBAT', 'GND', 'C0805', LCSC['C_4.7u_50V'])
C('C6', '100n', 'VBAT', 'GND')
C('C44', '4.7u_50V', 'VBAT_IN', 'GND', 'C0805', LCSC['C_4.7u_50V'])

# high-side current sense amplifier, 100 V/V -> 20 mV/A, 165 A full scale
# DCK/SC70-6 pinout: 1 REF, 2 GND, 3 VS, 4 IN+, 5 IN-, 6 OUT.  High-side
# sensing wants IN+ on the battery side of the shunt and IN- on the load
# side; the OpenESC reference wires these the other way round, which is why
# they are spelled out here.
add('U1', 'INA186A3IDCKR', 'SC70_6', LCSC['INA186A3IDCKR'],
    {'1': 'GND', '2': 'GND', '3': '+3V3', '4': 'VBAT_IN', '5': 'VBAT',
     '6': 'CURR_RAW'}, 'INA186')
R('R1', '1k', 'CURR_RAW', 'CURR')
C('C7', '100n', 'CURR', 'GND')

# ---- +9.85 V gate-drive rail (net +10V) (LMR51430, Vref 0.6 V, 100k / 6.49k) --------
add('U2', 'LMR51430YFDDCR', 'SOT23_6', LCSC['LMR51430YFDDCR'],
    {'1': 'GND', '2': 'SW_GD', '3': 'VBAT', '4': 'FB_GD', '5': 'VBAT',
     '6': 'BST_GD'}, 'LMR51430')
C('C8', '100n', 'BST_GD', 'SW_GD')
add('L1', '4.7uH', 'IND3030', LCSC['L_4.7u'], {'1': 'SW_GD', '2': '+10V'}, 'L')
R('R2', '100k', '+10V', 'FB_GD')
R('R3', '6.49k', 'FB_GD', 'GND')
C('C9', '22u_25V', '+10V', 'GND', 'C0805', LCSC['C_22u_25V'])
C('C10', '22u_25V', '+10V', 'GND', 'C0805', LCSC['C_22u_25V'])
C('C11', '100n', '+10V', 'GND')

# ---- +5 V BEC 2.5 A (LMR51430, 100k / 13.7k -> 4.98 V) -------------------
add('U3', 'LMR51430YFDDCR', 'SOT23_6', LCSC['LMR51430YFDDCR'],
    {'1': 'GND', '2': 'SW_5V', '3': 'VBAT', '4': 'FB_5V', '5': 'VBAT',
     '6': 'BST_5V'}, 'LMR51430')
C('C12', '100n', 'BST_5V', 'SW_5V')
add('L2', '4.7uH', 'IND3030', LCSC['L_4.7u'], {'1': 'SW_5V', '2': '+5V_BUCK'},
    'L')
R('R4', '100k', '+5V_BUCK', 'FB_5V')
R('R5', '13.7k', 'FB_5V', 'GND')
C('C13', '22u_25V', '+5V_BUCK', 'GND', 'C0805', LCSC['C_22u_25V'])
C('C14', '22u_25V', '+5V_BUCK', 'GND', 'C0805', LCSC['C_22u_25V'])
C('C15', '100n', '+5V_BUCK', 'GND')

# ---- 5 V rail: BEC or USB, whichever is higher ---------------------------
# Schottky OR rather than an ideal-diode mux: the BEC runs 5.08 V so it wins
# whenever a battery is connected, and USB alone still brings the whole 5 V
# rail up (at ~4.7 V) so a receiver can be configured on the bench.
add('D3', 'RB161QS-40', 'SOD882', LCSC['RB161QS-40'],
    {'2': '+5V_BUCK', '1': '+5V'}, 'D')
add('D4', 'RB161QS-40', 'SOD882', LCSC['RB161QS-40'],
    {'2': 'VBUS', '1': '+5V'}, 'D')
C('C16', '22u_25V', '+5V', 'GND', 'C0805', LCSC['C_22u_25V'])
C('C17', '100n', '+5V', 'GND')
C('C18', '100n', '+5V', 'GND')

# ---- +3V3 for the flight controller --------------------------------------
# WSON-6: 1 OUT, 2 NC, 3 GND, 4 EN, 5 PG (open drain), 6 IN, 7 EP
add('U4', 'LP5912-3.3DRVR', 'WSON6', LCSC['LP5912-3.3DRVR'],
    {'1': '+3V3', '2': 'NC_U4_2', '3': 'GND', '4': '+5V', '5': 'NC_U4_5',
     '6': '+5V', '7': 'GND'}, 'LDO6')
C('C19', '4.7u', '+3V3', 'GND')
C('C20', '100n', '+3V3', 'GND')
C('C21', '100n', '+3V3', 'GND')
C('C22', '100n', '+3V3', 'GND')

# ---- +3V3 for the four ESC MCUs, fed from the gate rail -------------------
# WSON-6: 1 OUT, 2 FB/SNS, 3 GND, 4 EN, 5 GND, 6 IN, 7 EP
add('U5', 'TLV76733DRVR', 'WSON6', LCSC['TLV76733DRVR'],
    {'1': '+3V3E', '2': '+3V3E', '3': 'GND', '4': '+10V', '5': 'GND',
     '6': '+10V', '7': 'GND'}, 'LDO6')
C('C23', '4.7u', '+3V3E', 'GND')
C('C24', '100n', '+3V3E', 'GND')

# power LEDs
LED('D5', '+5V_LED', 'GND')
R('R6', '2.4k', '+5V', '+5V_LED')
LED('D6', '+3V3_LED', 'GND')
R('R7', '2.4k', '+3V3', '+3V3_LED')


# =========================================================================
#  FLIGHT CONTROLLER -- STM32F722RET6
# =========================================================================
block('MCU')

MCU_PINS = {
    1:  '+3V3',        # VBAT
    2:  'BEEP_GATE',   # PC13
    3:  'LED0',        # PC14
    4:  'LED1',        # PC15
    5:  'HSE_IN',      # PH0
    6:  'HSE_OUT',     # PH1
    7:  'NRST',
    8:  'NC_PC0',      # PC0
    9:  'ADC_VBAT',    # PC1  ADC1_IN11
    10: 'CURR',        # PC2  ADC1_IN12
    11: 'ADC_RSSI',    # PC3  ADC1_IN13
    12: 'GND',         # VSSA
    13: '+3V3A',       # VDDA
    14: 'UART4_TX',    # PA0
    15: 'UART4_RX',    # PA1
    16: 'UART2_TX',    # PA2
    17: 'UART2_RX',    # PA3
    18: 'GND',
    19: '+3V3',
    20: 'GYRO_CS',     # PA4
    21: 'GYRO_SCK',    # PA5  SPI1
    22: 'GYRO_MISO',   # PA6
    23: 'GYRO_MOSI',   # PA7
    24: 'GYRO_INT',    # PC4
    25: 'NC_PC5',      # PC5
    26: 'M1',          # PB0  TIM3_CH3
    27: 'M2',          # PB1  TIM3_CH4
    28: 'NC_PB2',      # PB2 / BOOT1
    29: 'NC_PB10',     # PB10
    30: 'VCAP',
    31: 'GND',
    32: '+3V3',
    33: 'NC_PB12',
    34: 'NC_PB13',
    35: 'NC_PB14',
    36: 'NC_PB15',
    37: 'UART6_TX',    # PC6
    38: 'UART6_RX',    # PC7
    39: 'NC_PC8',
    40: 'NC_PC9',
    41: 'LED_STRIP',   # PA8  TIM1_CH1
    42: 'UART1_TX',    # PA9
    43: 'UART1_RX',    # PA10
    44: 'USB_DM',      # PA11
    45: 'USB_DP',      # PA12
    46: 'SWDIO',       # PA13
    47: 'GND',
    48: '+3V3',
    49: 'SWCLK',       # PA14
    50: 'FLASH_CS',    # PA15
    51: 'FLASH_SCK',   # PC10 SPI3
    52: 'FLASH_MISO',  # PC11
    53: 'FLASH_MOSI',  # PC12
    54: 'NC_PD2',
    55: 'NC_PB3',
    56: 'M3',          # PB4  TIM3_CH1
    57: 'M4',          # PB5  TIM3_CH2
    58: 'I2C_SCL',     # PB6
    59: 'I2C_SDA',     # PB7
    60: 'BOOT0',
    61: 'NC_PB8',
    62: 'NC_PB9',
    63: 'GND',
    64: '+3V3',
}
add('U6', 'STM32F722RET6', 'LQFP64', LCSC['STM32F722RET6'],
    dict((str(k), v) for k, v in MCU_PINS.items()), 'STM32F722')

# decoupling: one 100 nF per VDD pair plus bulk
for ref in ('C25', 'C26', 'C27', 'C28', 'C29'):
    C(ref, '100n', '+3V3', 'GND')
C('C30', '4.7u', '+3V3', 'GND')
C('C31', '4.7u', 'VCAP', 'GND')          # VCAP_1, F7 core regulator
C('C32', '100n', 'NRST', 'GND')
R('R8', '10k', 'BOOT0', 'GND')
R('R9', '10R', '+3V3', '+3V3A')          # VDDA filter
C('C33', '1u', '+3V3A', 'GND')
C('C34', '100n', '+3V3A', 'GND')

# 8 MHz HSE (USB needs a crystal on F7)
add('Y1', '8MHz', 'XTAL3225', LCSC['X32258MSB4SI'],
    {'1': 'HSE_IN', '2': 'GND', '3': 'HSE_OUT', '4': 'GND'}, 'XTAL')
C('C35', '20p', 'HSE_IN', 'GND')
C('C36', '20p', 'HSE_OUT', 'GND')

# status LEDs (active low, MCU sinks)
LED('D7', '+3V3', 'LED0_K')
R('R10', '510R', 'LED0_K', 'LED0')
LED('D8', '+3V3', 'LED1_K')
R('R11', '510R', 'LED1_K', 'LED1')

# battery voltage divider, 100k/10k -> 25.2 V maps to 2.29 V
R('R12', '100k', 'VBAT', 'ADC_VBAT')
R('R13', '10k', 'ADC_VBAT', 'GND')
C('C37', '100n', 'ADC_VBAT', 'GND')
# RSSI input, pulled down so a floating pad reads zero
R('R14', '10k', 'ADC_RSSI', 'GND')
R('R15', '1k', 'PAD_RSSI', 'ADC_RSSI')

# beeper driver
add('Q1', '2N7002', 'SOT23', LCSC['2N7002'],
    {'1': 'BEEP_G', '2': 'GND', '3': 'PAD_BZ-'}, 'NMOS')
R('R16', '220R', 'BEEP_GATE', 'BEEP_G')
R('R17', '100k', 'BEEP_G', 'GND')

# LED strip output (WS2812 on 5 V, series resistor for ringing)
R('R18', '220R', 'LED_STRIP', 'PAD_LED')


# =========================================================================
#  SENSORS AND BLACKBOX
# =========================================================================
block('SENSORS')

add('U7', 'ICM-42688-P', 'IMU', LCSC['ICM-42688-P'],
    {'1': 'GYRO_MISO', '2': 'NC_U7_2', '3': 'GND', '4': 'GYRO_INT',
     '5': '+3V3', '6': 'GND', '7': 'NC_U7_7', '8': '+3V3',
     '9': 'NC_U7_9', '10': 'NC_U7_10', '11': 'NC_U7_11',
     '12': 'GYRO_CS', '13': 'GYRO_SCK', '14': 'GYRO_MOSI'}, 'ICM42688')
C('C38', '100n', '+3V3', 'GND')
C('C39', '100n', '+3V3', 'GND')
R('R19', '10k', '+3V3', 'GYRO_CS')

# CSB tied high selects I2C, SDO low selects address 0x76
add('U8', 'BMP280', 'BARO', LCSC['BMP280'],
    {'1': 'GND', '2': '+3V3', '3': 'I2C_SDA', '4': 'I2C_SCL',
     '5': 'GND', '6': '+3V3', '7': 'GND', '8': '+3V3'}, 'BMP280')
C('C40', '100n', '+3V3', 'GND')
R('R20', '2.4k', '+3V3', 'I2C_SCL')
R('R21', '2.4k', '+3V3', 'I2C_SDA')

add('U9', 'W25Q128JVSIQ', 'SOIC8', LCSC['W25Q128JVSIQ'],
    {'1': 'FLASH_CS', '2': 'FLASH_MISO', '3': '+3V3', '4': 'GND',
     '5': 'FLASH_MOSI', '6': 'FLASH_SCK', '7': '+3V3', '8': '+3V3'},
    'W25Q')
C('C41', '100n', '+3V3', 'GND')
R('R22', '10k', '+3V3', 'FLASH_CS')


# =========================================================================
#  USB
# =========================================================================
block('USB')

# USB leaves the board on a JST-SH socket, to an external Type-C module, the
# way the RedFox A3 does it.  A Type-C receptacle on the board costs 9.6 x
# 6.6 mm and its shell posts are through-hole, so it blocks both faces at the
# middle of the front edge -- the single most expensive piece of real estate
# on a 36 mm board, and the reference product does without it.
#
# Six ways, not the reference's five: SM06B-SRSS-TB is the part already used
# for the video connector and its LCSC number is verified, whereas the 5-way
# SM05B could not be checked from here (lcsc.com is blocked by the egress
# proxy) and an unverified part number is how an order goes wrong.  The extra
# way is a second ground.  See docs/ALTERNATIVES.md.
add('J1', 'SM06B-SRSS-TB', 'SH6', LCSC['SM06B-SRSS-TB'],
    {'1': 'GND', '2': 'USB_DP', '3': 'USB_DM', '4': 'VBUS',
     '5': 'BOOT0', '6': 'GND', 'MP1': 'GND', 'MP2': 'GND'}, 'CONN6',
    desc='USB: GND / D+ / D- / 5V / BOOT / GND, to an external Type-C module')
C('C42', '100n', 'VBUS', 'GND')
C('C43', '4.7u', 'VBUS', 'GND')
# pins 1/6 are the two pads of I/O1 and 3/4 the two pads of I/O2, so each
# data line enters on one pad and leaves on the other
add('U10', 'USBLC6-2SC6', 'SOT23_6', LCSC['USBLC6-2SC6'],
    {'1': 'USB_DM', '2': 'GND', '3': 'USB_DP', '4': 'USB_DP',
     '5': 'VBUS', '6': 'USB_DM'}, 'USBLC6')


# =========================================================================
#  IO PADS AND CONNECTORS
# =========================================================================
block('IO')

# 6-pin JST-SH for a digital VTX (DJI / HDZero / Walksnail style)
add('J2', 'SM06B-SRSS-TB', 'SH6', LCSC['SM06B-SRSS-TB'],
    {'1': 'GND', '2': 'VBAT', '3': 'UART1_TX', '4': 'UART1_RX',
     '5': 'UART2_RX', '6': '+5V', 'MP1': 'GND', 'MP2': 'GND'}, 'CONN6',
    desc='HD VTX: GND / VBAT / TX1 / RX1 / SBUS(RX2) / 5V')

PADS = [
    ('P1',  '+5V',      '+5V'),
    ('P2',  'GND',      'GND'),
    ('P3',  'RX2',      'UART2_RX'),
    ('P4',  'TX2',      'UART2_TX'),
    ('P5',  '+5V',      '+5V'),
    ('P6',  'GND',      'GND'),
    ('P7',  'RX4',      'UART4_RX'),
    ('P8',  'TX4',      'UART4_TX'),
    ('P9',  'RX6',      'UART6_RX'),
    ('P10', 'TX6',      'UART6_TX'),
    ('P11', 'RX1',      'UART1_RX'),
    ('P12', 'TX1',      'UART1_TX'),
    ('P13', 'LED',      'PAD_LED'),
    ('P14', 'BZ-',      'PAD_BZ-'),
    ('P15', 'BZ+',      '+5V'),
    ('P16', 'RSSI',     'PAD_RSSI'),
    ('P17', 'SCL',      'I2C_SCL'),
    ('P18', 'SDA',      'I2C_SDA'),
    ('P19', '+3V3',     '+3V3'),
    ('P20', 'GND',      'GND'),
    ('P21', 'VBAT',     'VBAT'),
    ('P22', 'GND',      'GND'),
]
for ref, name, net in PADS:
    add(ref, name, 'PAD_M', '', {'1': net}, 'PAD')

# SWD / boot test points on the bottom side
for ref, net in (('TP1', 'SWDIO'), ('TP2', 'SWCLK'), ('TP3', 'NRST'),
                 ('TP4', 'BOOT0'), ('TP5', '+3V3'), ('TP6', 'GND')):
    add(ref, net, 'PAD_S', '', {'1': net}, 'PAD')

# mounting holes, 25.5 x 25.5
for ref in ('H1', 'H2', 'H3', 'H4'):
    add(ref, 'M2', 'MOUNT', '', {}, 'HOLE')


# =========================================================================
#  ESC -- four independent AM32 channels
# =========================================================================

# AT32F421G8U7 (QFN-28) AM32 pin map, as used by OpenESC-20x20.
def esc_channel(n, refbase, signal):
    """Emit one complete ESC channel.  n is 1..4."""
    block('ESC%d' % n)
    p = lambda s: '%s_%s' % (s, n)          # per-channel net
    A, B, Cc = p('PH_A'), p('PH_B'), p('PH_C')
    r = lambda i: '%s%d' % (refbase, i)

    add(r(0), 'AT32F421G8U7', 'QFN28', LCSC['AT32F421G8U7'], {
        '1':  p('BOOT0'),
        '2':  p('NC2'), '3': p('NC3'),
        '4':  p('NRST'),
        '5':  p('VDDA'),
        '6':  p('FBA'),
        '7':  p('FBCOM'),
        '8':  p('NC8'), '9': p('NC9'),
        '10': p('FBB'),
        '11': p('FBC'),
        '12': p('NC12'),
        '13': p('CL'),
        '14': p('BL'),
        '15': p('AL'),
        '16': 'GND',
        '17': '+3V3E',
        '18': p('CH'),
        '19': p('BH'),
        '20': p('AH'),
        '21': p('SWDIO'),
        '22': p('SWCLK'),
        '23': p('NC23'), '24': p('NC24'),
        '25': p('DSHOT_I'),
        '26': p('NC26'), '27': p('NC27'), '28': p('NC28'),
        '29': 'GND',
    }, 'AT32F421')

    add(r(1), 'NSG2065Q', 'QFN24', LCSC['NSG2065Q'], {
        '1':  p('AL'), '2': p('BL'), '3': p('CL'),
        '4':  '+10V',
        '5':  p('ND5'),
        '6':  'GND',
        '7':  p('ND7'), '8': p('ND8'),
        '9':  p('GLC'), '10': p('GLB'), '11': p('GLA'),
        '12': Cc, '13': p('GHC'), '14': p('BOOTC'),
        '15': B,  '16': p('GHB'), '17': p('BOOTB'),
        '18': A,  '19': p('GHA'), '20': p('BOOTA'),
        '21': p('ND21'),
        '22': p('AH'), '23': p('BH'), '24': p('CH'),
        '25': 'GND',
    }, 'NSG2065')

    # power stage: 3 half bridges, pin 1 = S, 2 = G, 3 = D
    fets = (('AH', 'VBAT', A, 'GAH'), ('AL', A, 'GND', 'GAL'),
            ('BH', 'VBAT', B, 'GBH'), ('BL', B, 'GND', 'GBL'),
            ('CH', 'VBAT', Cc, 'GCH'), ('CL', Cc, 'GND', 'GCL'))
    # PowerDI3333-8: pads 1-3 source, pad 4 gate, pad 5 drain
    for name, drain, source, gate in fets:
        add('Q%s%d' % (name, n), 'DOY180N03T', 'PDI3333', LCSC['DOY180N03T'],
            {'1': source, '2': source, '3': source, '4': p(gate),
             '5': drain}, 'NMOS3')

    # gate resistors
    for gd, gs in (('GHA', 'GAH'), ('GLA', 'GAL'), ('GHB', 'GBH'),
                   ('GLB', 'GBL'), ('GHC', 'GCH'), ('GLC', 'GCL')):
        R('R%s%d' % (gs, n), '15R', p(gd), p(gs))

    # bootstrap capacitors
    C('C%s%d' % ('BSA', n), '100n', A, p('BOOTA'), 'C0402',
      LCSC['C_100n_16V'])
    C('C%s%d' % ('BSB', n), '100n', B, p('BOOTB'), 'C0402',
      LCSC['C_100n_16V'])
    C('C%s%d' % ('BSC', n), '100n', Cc, p('BOOTC'), 'C0402',
      LCSC['C_100n_16V'])
    C('C%s%d' % ('VCC', n), '100n', '+10V', 'GND')
    C('C%s%d' % ('VDD', n), '100n', '+3V3E', 'GND')
    C('C%s%d' % ('VDA', n), '100n', p('VDDA'), 'GND')
    C('C%s%d' % ('RST', n), '100n', p('NRST'), 'GND')
    R('R%s%d' % ('VDA', n), '10R', '+3V3E', p('VDDA'))
    R('R%s%d' % ('RST', n), '10k', '+3V3E', p('NRST'))
    R('R%s%d' % ('BT0', n), '10k', p('BOOT0'), 'GND')
    R('R%s%d' % ('SIG', n), '220R', signal, p('DSHOT_I'))

    # BEMF sensing: 10k from each phase, 1k to ground, 10k to virtual neutral
    for ph, node in ((A, 'FBA'), (B, 'FBB'), (Cc, 'FBC')):
        tag = node[-1]
        R('RB%s%d' % (tag, n), '10k', ph, p(node))
        R('RN%s%d' % (tag, n), '1k', p(node), 'GND')
        R('RC%s%d' % (tag, n), '10k', p(node), p('FBCOM'))

    # motor phase pads
    for k, (tag, net) in enumerate((('A', A), ('B', B), ('C', Cc))):
        add('J%d' % (10 + 3 * (n - 1) + k), 'M%d%s' % (n, tag), 'PAD_MOT',
            '', {'1': net}, 'PAD')

    # SWD test pads per channel
    add('TP%d' % (5 + 2 * n), 'SWDIO%d' % n, 'PAD_S', '', {'1': p('SWDIO')},
        'PAD')
    add('TP%d' % (6 + 2 * n), 'SWCLK%d' % n, 'PAD_S', '', {'1': p('SWCLK')},
        'PAD')


esc_channel(1, 'U2', 'M1')
esc_channel(2, 'U3', 'M2')
esc_channel(3, 'U4', 'M3')
esc_channel(4, 'U5', 'M4')


# =========================================================================
#  derived data
# =========================================================================

def nets():
    """net name -> sorted list of (ref, pin)."""
    out = {}
    for part in PARTS.values():
        for pin, net in part.pins.items():
            out.setdefault(net, []).append((part.ref, pin))
    for k in out:
        out[k].sort()
    return out


def check():
    """Sanity checks that must hold before anything is generated."""
    problems = []
    n = nets()
    for name, pins in sorted(n.items()):
        if name.startswith('NC_') or name.startswith('NC') and '_' in name:
            continue
        if name.startswith('ND') or name.startswith('NC'):
            continue
        if len(pins) < 2:
            problems.append('net %r has a single connection: %s' % (name, pins))
    refs = set(PARTS)
    if len(refs) != len(PARTS):
        problems.append('duplicate refs')
    for part in PARTS.values():
        if part.fp not in FP.values():
            problems.append('%s: unknown footprint %s' % (part.ref, part.fp))
        pkg = LCSC_PACKAGE.get(part.lcsc)
        if pkg and pkg not in part.fp:
            problems.append('%s: %s is a %s part but the footprint is %s'
                            % (part.ref, part.lcsc, pkg,
                               part.fp.split(':')[-1]))
    return problems


if __name__ == '__main__':
    n = nets()
    print('parts: %d   nets: %d' % (len(PARTS), len(n)))
    from collections import Counter
    print(Counter(p.block for p in PARTS.values()))
    bad = check()
    for b in bad:
        print('!!', b)
    print('%d problems' % len(bad))
