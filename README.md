Tension Control Test
tension Control Test เป็นเกมทดสอบการควบคุมเสถียรภาพแบบแนวนอน ผู้เล่นต้องควบคุม marker ให้อยู่ใกล้จุดศูนย์กลางของบาร์ให้มากที่สุด ระหว่างที่ระบบสร้างแรงรบกวนหลายรูปแบบเข้ามา

เป้าหมายหลักของเกมคือ:

No matter what happens, pull the marker back to the center.

ระหว่างเล่น ผู้เล่นไม่จำเป็นต้องรู้ว่าเกมกำลังใช้ pattern อะไรอยู่ เพราะสิ่งที่ต้องการวัดคือการตอบสนองต่อการเสียสมดุล ไม่ใช่การจำด่านหรือจำรูปแบบแรงรบกวน

Gameplay
ผู้เล่นควบคุม marker บน stability bar แนวนอน

จุดกึ่งกลางคือ Safe Zone
marker จะถูกแรงรบกวนจากระบบดันออกจาก center
ผู้เล่นใช้ปุ่มลูกศรซ้ายและขวาเพื่อดึง marker กลับเข้ากลาง
เป้าหมายคือรักษา marker ให้อยู่ใกล้ center ให้มากที่สุด
Controls:

Pull Left [←] [→] Pull Right

Core Physics
ระบบฟิสิกส์ของเกมใช้แนวคิดง่าย ๆ คือรวมแรงจากผู้เล่นกับแรงรบกวนของระบบ

totalForce = playerInputForce + patternDisturbanceForce

จากนั้นนำแรงรวมไปอัปเดตความเร็วและตำแหน่งของ marker

velocity += totalForce * deltaTime velocity *= damping position += velocity * deltaTime

ตำแหน่งของ marker ถูกจำกัดให้อยู่ในช่วง:

-100 to +100

Safe Zone อยู่ใกล้ตำแหน่งกึ่งกลาง:

-5 to +5

Disturbance Patterns
เกมมี disturbance patterns หลายรูปแบบ แต่ pattern เหล่านี้จะถูกซ่อนไว้ระหว่างเล่น เพื่อให้ผู้เล่นโฟกัสกับการดึง marker กลับเข้ากลางเท่านั้น

Kick
Kick เป็นแรงกระแทกที่ผลัก marker ออกจาก center อย่างรุนแรง หลังจากนั้น rail จะรู้สึกหนัก ทำให้การดึง marker กลับเข้ากลางต้องใช้การกดค้างนานขึ้น

Constant Pull
Constant Pull เป็นแรงดึงต่อเนื่องไปทางใดทางหนึ่ง ผู้เล่นต้องกดต้านแรงดึงนั้น และต้องระวังไม่ให้ดึงแรงเกินจนเกิด overcorrection

Wave Pull
Wave Pull เป็นแรงแบบ sine wave ที่ส่าย marker ไปทางซ้ายและขวา ผู้เล่นต้องปรับการกดตามจังหวะของแรงรบกวน

Slippery
Slippery ทำให้การควบคุมไวและลื่นขึ้น การกดเพียงเล็กน้อยสามารถทำให้ marker เคลื่อนที่มากกว่าปกติ จึงเสี่ยงต่อการแก้แรงเกิน

Momentum
Momentum ทำให้ marker มีแรงเฉื่อยสูง เมื่อ marker เริ่มเคลื่อนที่ มันจะยังไหลต่อแม้ผู้เล่นปล่อยปุ่ม ผู้เล่นจึงต้องกดสวนเพื่อเบรก

Wind Burst
Wind Burst เป็นแรงลมที่พัดเข้ามาเป็นระลอก ผู้เล่นต้อง recover marker กลับเข้ากลางระหว่างแต่ละ gust

Fairness
เกมนี้ออกแบบให้ fair ระหว่างผู้เล่น

ระบบสุ่มเฉพาะ:

ลำดับของ pattern
ทิศทางซ้ายหรือขวาของแรงรบกวน
ระบบไม่สุ่ม:

ความแรงของ pattern
timing ของแรงรบกวน
duration ของ pattern
physics modifier
scoring rule
ตัวอย่างเช่น ถ้า Kick มีแรง 180:

Player A may receive +180 Player B may receive -180

ทิศทางต่างกัน แต่ magnitude เท่ากัน ดังนั้น difficulty เท่ากัน

การให้คะแนนใช้ระยะห่างจาก center แบบ absolute value:

distanceFromCenter = Math.abs(position)

ดังนั้นการหลุดไปทางซ้ายหรือขวาจะถูกคิดคะแนนเท่ากัน

Scoring Metrics
ระบบคะแนนไม่ได้วัดแค่ว่าผู้เล่นชนะหรือแพ้ แต่วัดจากหลาย metrics ที่สะท้อนการควบคุมเสถียรภาพ

Time in Safe Zone
วัดว่าผู้เล่นรักษา marker ให้อยู่ใน Safe Zone ได้นานแค่ไหน

timeInSafeZonePercent = (timeInZoneMs / durationMs) * 100

Average Distance from Center
วัดว่าโดยเฉลี่ย marker อยู่ห่างจาก center เท่าไหร่

averageDistanceFromCenter = distanceSum / sampleCount

Max Deviation
วัดว่า marker หลุดออกจาก center ไกลที่สุดเท่าไหร่

maxDeviation = max(distanceFromCenter)

Recovery Time
วัดว่าหลังจาก marker หลุดออกไปไกล ผู้เล่นใช้เวลานานแค่ไหนในการดึงกลับเข้า Safe Zone

ระบบถือว่า major drift เริ่มต้นเมื่อ:

distanceFromCenter >= 20

สูตร recovery time คือ:

recoveryTimeMs = timeReturnedToSafeZone - timeMajorDriftStarted

Overcorrection Count
วัดจำนวนครั้งที่ผู้เล่นแก้แรงเกินจน marker ข้ามจากฝั่งหนึ่งไปอีกฝั่งหนึ่ง

ตัวอย่าง:

left -> right = +1 overcorrection right -> left = +1 overcorrection

Pattern Score Formula
แต่ละ pattern จะถูกคำนวณคะแนนแยกกัน

```
patternScore =
timeInSafeZonePercent * 0.4

distanceScore * 0.3
recoveryScore * 0.2
overcorrectionScore * 0.1
```
น้ำหนักคะแนนคือ:

Time in Safe Zone 40% Average Distance 30% Recovery Time 20% Overcorrection Count 10%

Overall Score
เมื่อเล่นครบทุก pattern ระบบจะนำคะแนนของแต่ละ pattern มาเฉลี่ยเป็นคะแนนรวม

overallScore = sum(patternScores) / numberOfPatterns

Result Screen
หลังจบเกม ผู้เล่นจะเห็นผลลัพธ์รวมและรายละเอียดของแต่ละ pattern

Result screen แสดงข้อมูลหลักดังนี้:

Overall Score
Overall Time in Safe Zone
Average Distance from Center
Max Deviation
Average Recovery Time
Total Overcorrections
Pattern-by-pattern performance table
ระหว่างเล่น ผู้เล่นจะไม่เห็นชื่อ pattern เพื่อให้โฟกัสกับการควบคุม marker แต่หลังจบเกมสามารถดูได้ว่า performance ของแต่ละ segment เป็นอย่างไร

What This Game Measures
เกมนี้วัดทักษะการควบคุมเสถียรภาพภายใต้แรงรบกวน

ในเชิงเปรียบเทียบกับ software development marker สามารถแทนสถานะของระบบ ส่วนผู้เล่นทำหน้าที่เหมือน developer หรือ operator ที่ต้องรักษาระบบให้อยู่ในสภาวะ stable

Mapping ของ metrics สามารถอธิบายได้ดังนี้:

Time in Safe Zone = system stability / uptime Average Distance = average error magnitude Max Deviation = incident severity Recovery Time = mean time to recovery Overcorrection Count = over-fixing / side effects

เกมนี้จึงสะท้อนทักษะ เช่น:

Stability maintenance
Fast recovery
Precision control
Avoiding overcorrection
Adapting to changing disturbances
Design Principle
UI ระหว่างเล่นตั้งใจซ่อนข้อมูล pattern เพื่อไม่ให้ผู้เล่นโฟกัสผิดจุด

ระหว่างเล่น ผู้เล่นควรสนใจแค่:

Where is the marker? Where is the center? Which direction should I pull?

แนวคิดหลักคือผู้เล่นไม่จำเป็นต้องรู้ว่าแรงรบกวนชื่ออะไร แต่ต้องสามารถตอบสนองต่อการเสียสมดุลและดึง marker กลับเข้ากลางให้ได้
``
