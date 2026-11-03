
final class NativeWorldLabGeodesyTests:XCTestCase {
    func testWGS84EquatorPoleAndGeodeticRoundtrip() throws {
        let equator=try NativeWorldLabGeodesy.toEcef(
            NativeGeodetic(latitudeDegrees:0,longitudeDegrees:0,heightMeters:0))
        XCTAssertEqual(equator.xMeters,6378137,accuracy:1e-8)
        let north=try NativeWorldLabGeodesy.toEcef(
            NativeGeodetic(latitudeDegrees:90,longitudeDegrees:0,heightMeters:0))
        XCTAssertEqual(north.zMeters,6356752.314245,accuracy:1e-5)
        let fixtures=[
            NativeGeodetic(latitudeDegrees:51.5074,longitudeDegrees:-0.1278,heightMeters:35),
            NativeGeodetic(latitudeDegrees:-33.8688,longitudeDegrees:151.2093,heightMeters:58),
            NativeGeodetic(latitudeDegrees:89.999,longitudeDegrees:179.999,heightMeters:-400),
            NativeGeodetic(latitudeDegrees:0.001,longitudeDegrees:-179.999,heightMeters:35786000),
            NativeGeodetic(latitudeDegrees:-90,longitudeDegrees:0,heightMeters:1200)
        ]
        for point in fixtures {
            let back=try NativeWorldLabGeodesy.fromEcef(NativeWorldLabGeodesy.toEcef(point))
            XCTAssertEqual(back.latitudeDegrees,point.latitudeDegrees,accuracy:1e-8)
            XCTAssertEqual(back.heightMeters,point.heightMeters,accuracy:1e-3)
        }
    }
    func testENUFrameRoundtripAndInvalidCoordinates() throws {
        let origin=NativeGeodetic(latitudeDegrees:40.7,longitudeDegrees:-74,heightMeters:12)
        let point=try NativeWorldLabGeodesy.toEcef(origin)
        let zero=try NativeWorldLabGeodesy.toEnu(point,origin:origin)
        XCTAssertEqual(zero.eastMeters,0,accuracy:1e-8)
        let local=NativeEnu(eastMeters:1250,northMeters:-850,upMeters:230)
        let ecef=try NativeWorldLabGeodesy.fromEnu(local,origin:origin)
        let restored=try NativeWorldLabGeodesy.toEnu(ecef,origin:origin)
        XCTAssertEqual(restored.eastMeters,local.eastMeters,accuracy:1e-8)
        XCTAssertEqual(restored.northMeters,local.northMeters,accuracy:1e-8)
        XCTAssertEqual(restored.upMeters,local.upMeters,accuracy:1e-8)
        XCTAssertThrowsError(try NativeWorldLabGeodesy.toEcef(
            NativeGeodetic(latitudeDegrees:91,longitudeDegrees:0,heightMeters:0)))
        XCTAssertThrowsError(try NativeWorldLabGeodesy.fromEcef(
            NativeEcef(xMeters:0,yMeters:0,zMeters:0)))
    }
}
